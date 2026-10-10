#!/usr/bin/env node
/**
 * optimize-images.mjs —— 图片批量压缩管线（长边限幅 + 有损 WebP）
 * ============================================================================
 * 用途：
 *   把「原始素材图」（可能几十 MB 的 PNG/JPG）批量压成体积可控的 WebP，
 *   以便安全地提交进 git 仓库、并直接作为 Astro 的 `src/assets/` 资源使用。
 *
 * 设计目标（为了后续能批量导入几百张图而写）：
 *   1. 清单驱动：所有输入输出与压缩参数都写在 tools/image-manifest.json 里，
 *      脚本本身不含任何硬编码路径，换一批图只需要改清单。
 *   2. 幂等可重跑：直接覆盖输出文件；写入时先写临时文件再原子改名，
 *      中途失败不会留下半截损坏的图片。
 *   3. 容错：单张图失败（文件不存在 / 解码失败 / 路径不合法）只警告并跳过，
 *      全部处理完后以「失败数量」作为退出码，方便 CI 或脚本判断。
 *   4. 只读源文件：脚本从不写入、移动或删除 src 指向的任何文件。
 *
 * 用法：
 *   node tools/optimize-images.mjs                        # 用同目录的 manifest
 *   node tools/optimize-images.mjs --manifest=其他清单.json
 *   node tools/optimize-images.mjs --dry-run              # 只报数不写文件
 *   node tools/optimize-images.mjs --report=tools/image-report.json
 *   node tools/optimize-images.mjs --root=<项目根目录>
 *
 * 清单格式（JSON 数组，每项）：
 *   {
 *     "src":     绝对路径（也允许写相对项目根的相对路径）,
 *     "out":     相对项目根的输出路径（必须以 .webp 结尾，且必须落在项目目录内）,
 *     "maxEdge": 长边像素上限（小图不放大）,
 *     "quality": WebP 有损质量 1-100（越大越清晰、体积越大）
 *   }
 *
 * 退出码：
 *   0           全部成功
 *   1..254      有 N 项失败（退出码 = 失败数，超过 255 会被夹到 255）
 *   255         清单本身无法读取/解析（致命错误，未处理任何图片）
 * ============================================================================
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// ---------------------------------------------------------------------------
// 路径常量
// 用 import.meta.url 推导脚本自身位置，这样无论从哪个工作目录调用都不会找错清单。
// ---------------------------------------------------------------------------
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST = path.join(SCRIPT_DIR, 'image-manifest.json');
const DEFAULT_PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..'); // tools/ 的上一级即项目根

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

/** 把字节数格式化成人类可读的体积字符串（用于日志，不参与计算）。 */
function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '未知';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** 解析形如 `--key=value` / `--key value` / `--flag` 的命令行参数。 */
function parseArgs(argv) {
  const opts = { manifest: DEFAULT_MANIFEST, root: DEFAULT_PROJECT_ROOT, dryRun: false, report: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--manifest')) opts.manifest = (arg.split('=')[1] ?? argv[++i]);
    else if (arg.startsWith('--root')) opts.root = (arg.split('=')[1] ?? argv[++i]);
    else if (arg.startsWith('--report')) opts.report = (arg.split('=')[1] ?? argv[++i]);
    else console.warn(`[警告] 无法识别的参数，已忽略：${arg}`);
  }
  return opts;
}

/** 读取并解析清单文件；自动剥掉 Windows 记事本可能写入的 UTF-8 BOM。 */
async function readManifest(manifestPath) {
  const raw = await fsp.readFile(manifestPath, 'utf8');
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('清单文件顶层必须是数组（JSON Array）');
  return data;
}

/**
 * 判断 target 是否位于 root 目录内部（含 root 自身）。
 * 用来兜底：万一清单里写了 `../../` 或绝对路径，也不会把文件写到项目外。
 */
function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// ---------------------------------------------------------------------------
// 单张图片处理
// ---------------------------------------------------------------------------

/**
 * 处理清单中的一项。
 * @returns {Promise<{ok: true, record: object} | {ok: false, src: string, reason: string}>}
 */
async function processItem(item, index, ctx) {
  const label = `#${String(index + 1).padStart(3, '0')}`;
  const srcRaw = typeof item?.src === 'string' ? item.src : '';

  try {
    // --- 1. 参数校验 -------------------------------------------------------
    if (!srcRaw || typeof item?.out !== 'string' || !item.out) {
      throw new Error('清单项缺少 src 或 out 字段');
    }
    const maxEdge = Number(item.maxEdge);
    const quality = Number(item.quality);
    if (!Number.isFinite(maxEdge) || maxEdge <= 0) throw new Error(`maxEdge 非法：${item.maxEdge}`);
    if (!Number.isFinite(quality) || quality < 1 || quality > 100) throw new Error(`quality 非法：${item.quality}`);

    // --- 2. 解析输入/输出路径 ---------------------------------------------
    // src 允许绝对路径（推荐）或相对项目根的相对路径。
    const src = path.isAbsolute(srcRaw) ? path.normalize(srcRaw) : path.resolve(ctx.root, srcRaw);
    // out 按约定是「相对项目根」的路径。
    const out = path.resolve(ctx.root, item.out);
    if (!isInside(ctx.root, out)) {
      throw new Error(`输出路径越出项目目录，已拒绝写入：${out}`);
    }

    // --- 3. 读取源文件信息（只读，绝不修改源文件）--------------------------
    let srcStat;
    try {
      srcStat = await fsp.stat(src);
    } catch {
      throw new Error(`源文件不存在或无法访问：${src}`);
    }
    if (!srcStat.isFile()) throw new Error(`源路径不是文件：${src}`);

    // --- 4. 读取原始尺寸 ---------------------------------------------------
    const meta = await sharp(src).metadata();
    if (!meta.width || !meta.height) throw new Error('无法读取原图尺寸（可能不是受支持的图片格式）');

    const outRel = path.relative(ctx.root, out).split(path.sep).join('/');
    const record = {
      src,
      out,
      outRel,
      maxEdge,
      quality,
      srcWidth: meta.width,
      srcHeight: meta.height,
      srcBytes: srcStat.size,
      outWidth: meta.width,
      outHeight: meta.height,
      outBytes: srcStat.size,
      skipped: false,
    };

    // --- 5. 压缩 -----------------------------------------------------------
    // resize 说明：
    //   fit: 'inside' + 同时给出 width/height => 保持宽高比，把图片「装进」
    //   maxEdge × maxEdge 的正方形盒子里，也就是「长边不超过 maxEdge」。
    //   withoutEnlargement: true => 本来就比 maxEdge 小的图保持原尺寸，不放大。
    // WebP 说明：
    //   不调用 flatten()/removeAlpha()，因此 PNG 的透明通道会被保留
    //   （alphaQuality 默认 100，透明边缘不会被压花）。
    if (!ctx.dryRun) {
      await fsp.mkdir(path.dirname(out), { recursive: true }); // 自动创建父目录
      // 先写临时文件再改名，避免失败时留下半截文件；临时文件也在目标目录内。
      const tmp = `${out}.tmp-${process.pid}`;
      try {
        await sharp(src)
          .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
          .webp({ quality, effort: 4, alphaQuality: 100 })
          .toFile(tmp);
        await fsp.rename(tmp, out); // Windows 上 rename 会覆盖已存在的目标文件
      } catch (err) {
        await fsp.rm(tmp, { force: true }).catch(() => {});
        throw err;
      }
      const [outStat, outMeta] = await Promise.all([fsp.stat(out), sharp(out).metadata()]);
      record.outBytes = outStat.size;
      record.outWidth = outMeta.width ?? record.srcWidth;
      record.outHeight = outMeta.height ?? record.srcHeight;
    }

    return { ok: true, record, label };
  } catch (err) {
    return { ok: false, label, src: srcRaw, reason: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log('用法: node tools/optimize-images.mjs [--manifest=路径] [--root=项目根] [--dry-run] [--report=输出json]');
    return 0;
  }

  const root = path.resolve(opts.root);

  // ---- 读取清单（致命错误直接退出）--------------------------------------
  let items;
  try {
    items = await readManifest(path.resolve(opts.manifest));
  } catch (err) {
    console.error(`[致命] 无法读取清单 ${opts.manifest}：${err instanceof Error ? err.message : err}`);
    return 255;
  }

  console.log('===============================================================');
  console.log('图片压缩管线 optimize-images.mjs');
  console.log(`清单文件：${path.resolve(opts.manifest)}`);
  console.log(`项目根目录：${root}`);
  console.log(`待处理：${items.length} 项${opts.dryRun ? '（dry-run：只统计，不写文件）' : ''}`);
  console.log('===============================================================');

  const ctx = { root, dryRun: opts.dryRun };
  const records = [];
  const failures = [];
  // 输出路径左对齐用的宽度，只为日志好看。
  const padWidth = Math.min(
    64,
    Math.max(10, ...items.map((it) => String(it?.out ?? '').length)),
  );

  // ---- 逐项处理（串行：内存占用可控，日志顺序稳定）-----------------------
  for (let i = 0; i < items.length; i += 1) {
    const result = await processItem(items[i], i, ctx);

    if (!result.ok) {
      failures.push({ index: i + 1, src: result.src, reason: result.reason });
      console.warn(`[警告] 第 ${i + 1} 项处理失败，已跳过：${result.src}\n        原因：${result.reason}`);
      continue;
    }

    const r = result.record;
    records.push(r);
    const savedBytes = r.srcBytes - r.outBytes;
    const savedPct = r.srcBytes > 0 ? (savedBytes / r.srcBytes) * 100 : 0;
    const verdict = savedBytes >= 0 ? `节省 ${savedPct.toFixed(2)}%` : `增大 ${(-savedPct).toFixed(2)}%`;
    console.log(
      `${r.outRel.padEnd(padWidth)} | 原图 ${r.srcWidth}x${r.srcHeight} ${formatBytes(r.srcBytes)}` +
        ` → 新图 ${r.outWidth}x${r.outHeight} ${formatBytes(r.outBytes)} (${verdict})`,
    );
  }

  // ---- 汇总 --------------------------------------------------------------
  const totalSrc = records.reduce((sum, r) => sum + r.srcBytes, 0);
  const totalOut = records.reduce((sum, r) => sum + r.outBytes, 0);
  const totalSaved = totalSrc - totalOut;
  const totalPct = totalSrc > 0 ? (totalSaved / totalSrc) * 100 : 0;

  console.log('===============================================================');
  console.log(`处理成功：${records.length} 项`);
  console.log(`处理失败：${failures.length} 项`);
  console.log(
    `总体积对比：${formatBytes(totalSrc)} → ${formatBytes(totalOut)}` +
      `（节省 ${formatBytes(totalSaved)}，压缩率 ${totalPct.toFixed(2)}%）`,
  );
  if (failures.length > 0) {
    console.log('失败明细：');
    for (const f of failures) console.log(`  - #${f.index} ${f.src} => ${f.reason}`);
  }
  console.log('===============================================================');

  // ---- 可选：写出机器可读报告，方便后续统计/接 CI ------------------------
  if (opts.report) {
    const reportPath = path.resolve(root, opts.report);
    await fsp.mkdir(path.dirname(reportPath), { recursive: true });
    await fsp.writeFile(
      reportPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          manifest: path.resolve(opts.manifest),
          dryRun: opts.dryRun,
          successCount: records.length,
          failureCount: failures.length,
          totalSrcBytes: totalSrc,
          totalOutBytes: totalOut,
          items: records,
          failures,
        },
        null,
        2,
      ),
      'utf8',
    );
    console.log(`报告已写入：${path.relative(root, reportPath).split(path.sep).join('/')}`);
  }

  // ---- 退出码 = 失败数量（超过 255 时夹到 255，保证一定非零）-------------
  return Math.min(failures.length, 255);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error('[致命] 管线异常终止：', err);
    process.exitCode = 255;
  });
