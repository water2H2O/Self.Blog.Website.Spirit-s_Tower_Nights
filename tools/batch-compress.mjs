#!/usr/bin/env node
/**
 * batch-compress.mjs —— OC 素材批量压缩（递归遍历 + 镜像目录结构 → assets-staging/）
 * ============================================================================
 * 与 tools/optimize-images.mjs 的关系：
 *   optimize-images.mjs 是「清单驱动」的：输入输出都写在 tools/image-manifest.json
 *   里，一次处理几十条人工登记的记录。本脚本是「目录驱动」的：用于一次性把整个
 *   素材库里上百张图按规则扫出来、递归压缩、镜像输出。两者完全独立，
 *   image-manifest.json 与 optimize-images.mjs 保持原样可用、互不影响。
 *
 * 用法：
 *   node tools/batch-compress.mjs                 # 正式压缩
 *   node tools/batch-compress.mjs --dry-run       # 只扫描/试压统计，不写任何文件
 *   node tools/batch-compress.mjs --limit=20      # 只处理前 20 张（调试用）
 *   node tools/batch-compress.mjs --src=<目录> --out=<目录> --csv=<文件>
 *
 * 输出：
 *   assets-staging/**.webp            镜像源结构的压缩结果
 *   assets-staging/_index.csv         UTF-8 带 BOM，Excel 直接打开中文不乱码
 *   tools/batch-compress-report.json  机器可读的完整报告
 *
 * 退出码 = 失败数量（0 表示全部成功，>0 表示有 N 张失败被跳过）。
 * ============================================================================
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_SRC = 'C:\\Users\\water2H2O\\Desktop\\oc相关\\【原创&本家】水塔夜谈';
const DEFAULT_OUT = path.join(PROJECT_ROOT, 'assets-staging');
const DEFAULT_CSV = path.join(PROJECT_ROOT, 'assets-staging', '_index.csv');
const DEFAULT_REPORT = path.join(SCRIPT_DIR, 'batch-compress-report.json');

// ---------------------------------------------------------------------------
// 规则配置
// ---------------------------------------------------------------------------
/**
 * 收集范围（相对源根目录）。四类来源，其余文件夹一律不进入。
 *   rootFiles：只收白名单里的顶层文件（源根目录只取世界观logo.png，
 *              避免误收 ~$世界观.docx、参考文件.zip 之类）
 *   ownFiles ：收该目录下的所有顶层图片（回响之殿的音乐封面）
 *   subDirs  ：额外收这些子目录（回响之殿/pv）
 *   recursive：整棵子树递归（其余三类）
 */
const SCOPE = [
  { dir: '', rootFiles: ['世界观logo.png'] },
  { dir: '芸芸众生（人物档案）', recursive: true },
  { dir: '回响之殿（音乐作品）', ownFiles: true, subDirs: ['pv'] },
  { dir: '平行时空（同人&群友创作）', recursive: true },
  { dir: '讯息（重要的和通信邮件记录）', recursive: true },
];

/** 递归时按名字跳过的子目录（出现在任意层级都跳过）。 */
const SKIP_DIR_NAMES = new Set(['部分图片的工程文件或拆分', '工程记录（部分）']);

/** 只处理这四种扩展名；.psd/.zip/.ani/.mp4/.wav/.mp3/.docx/.pdf/.txt/.xlsx/.mhtml 天然被排除。 */
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif']);

/** 压缩规格：长边上限 + WebP 有损质量。 */
const PRESETS = {
  normal: { name: '静态图', maxEdge: 1600, quality: 82, effort: 4 },
  meme: { name: '表情包', maxEdge: 700, quality: 80, effort: 4 },
  animated: { name: '动图', maxEdge: 600, quality: 75, effort: 6 },
};

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = {
    src: DEFAULT_SRC,
    out: DEFAULT_OUT,
    csv: DEFAULT_CSV,
    report: DEFAULT_REPORT,
    dryRun: false,
    limit: 0,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a.startsWith('--src')) opts.src = a.split('=')[1] ?? argv[++i];
    else if (a.startsWith('--out')) opts.out = a.split('=')[1] ?? argv[++i];
    else if (a.startsWith('--csv')) opts.csv = a.split('=')[1] ?? argv[++i];
    else if (a.startsWith('--report')) opts.report = a.split('=')[1] ?? argv[++i];
    else if (a.startsWith('--limit')) opts.limit = Number(a.split('=')[1] ?? argv[++i]) || 0;
    else console.warn(`[警告] 未识别参数，已忽略：${a}`);
  }
  return opts;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '未知';
  const sign = bytes < 0 ? '-' : '';
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${bytes} B`;
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(2)} KB`;
  return `${sign}${(abs / 1024 / 1024).toFixed(2)} MB`;
}

const toPosix = (p) => p.split(path.sep).join('/');
const kb = (bytes) => Math.round((bytes / 1024) * 100) / 100;
const pct = (from, to) => (from > 0 ? ((from - to) / from) * 100 : 0);

/** CSV 单元格转义：含逗号/引号/换行时用双引号包裹，内部引号翻倍。 */
function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 按规则给单张图选压缩预设。 */
function pickPreset(relPosix, ext) {
  if (ext === '.gif') return PRESETS.animated;
  if (relPosix.includes('表情包')) return PRESETS.meme;
  return PRESETS.normal;
}

/** 动图总时长：sharp 的 metadata.delay 是「每帧延时」数组，求和即为总时长（毫秒）。 */
const totalDuration = (meta) => (Array.isArray(meta?.delay) ? meta.delay.reduce((a, b) => a + (b || 0), 0) : null);

// ---------------------------------------------------------------------------
// 1. 扫描：递归遍历源目录（只读，绝不写入/移动/删除源文件）
// ---------------------------------------------------------------------------
async function collectFiles(srcRoot) {
  const found = [];
  const skippedDirs = [];
  const counters = { dirsEntered: 0, filesSeen: 0, filesByExt: {} };

  /** 递归遍历一个目录，把图片推进 found。 */
  async function walk(absDir, relDir) {
    let entries;
    try {
      entries = await fsp.readdir(absDir, { withFileTypes: true });
    } catch (err) {
      console.warn(`[警告] 无法读取目录，已跳过：${absDir}（${err.code ?? err.message}）`);
      return;
    }
    counters.dirsEntered += 1;
    // 按名字排序，保证多次运行顺序一致、可复现。
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const entry of entries) {
      const abs = path.join(absDir, entry.name);
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) {
          skippedDirs.push(rel);
          continue;
        }
        await walk(abs, rel);
        continue;
      }
      if (!entry.isFile()) continue; // 符号链接等一律不碰
      counters.filesSeen += 1;
      const ext = path.extname(entry.name).toLowerCase();
      counters.filesByExt[ext] = (counters.filesByExt[ext] ?? 0) + 1;
      if (!IMAGE_EXT.has(ext)) continue;
      found.push({ abs, rel, ext });
    }
  }

  for (const s of SCOPE) {
    const absBase = s.dir ? path.join(srcRoot, s.dir) : srcRoot;
    try {
      const st = await fsp.stat(absBase);
      if (!st.isDirectory()) throw new Error('不是目录');
    } catch (err) {
      console.warn(`[警告] 范围目录不存在或不可读，已跳过：${absBase}（${err.code ?? err.message}）`);
      continue;
    }

    // (a) 该目录自己的顶层文件
    if (s.ownFiles || s.rootFiles) {
      const entries = await fsp.readdir(absBase, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (s.rootFiles && !s.rootFiles.includes(entry.name)) continue; // 白名单
        const ext = path.extname(entry.name).toLowerCase();
        if (!IMAGE_EXT.has(ext)) continue;
        found.push({
          abs: path.join(absBase, entry.name),
          rel: s.dir ? `${s.dir}/${entry.name}` : entry.name,
          ext,
        });
      }
    }

    // (b) 额外指定的子目录
    for (const sub of s.subDirs ?? []) {
      const absSub = path.join(absBase, sub);
      try {
        await fsp.stat(absSub);
      } catch {
        console.warn(`[警告] 指定子目录不存在，已跳过：${absSub}`);
        continue;
      }
      await walk(absSub, s.dir ? `${s.dir}/${sub}` : sub);
    }

    // (c) 整棵子树
    if (s.recursive) await walk(absBase, s.dir);
  }

  // 去重（防止范围重叠导致同一文件被收两次）
  const seen = new Set();
  const unique = [];
  for (const f of found) {
    const key = f.rel.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(f);
  }
  unique.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return { files: unique, skippedDirs, counters };
}

// ---------------------------------------------------------------------------
// 2. 推导输出路径：镜像结构，只换扩展名；同名冲突加 -2 后缀
// ---------------------------------------------------------------------------
function planOutputs(files, outRoot) {
  const usedByDir = new Map(); // 输出目录 → Set(已占用的小写文件名)
  for (const f of files) {
    const dirRel = toPosix(path.dirname(f.rel)); // '.' = 输出根
    const base = path.basename(f.rel, path.extname(f.rel));
    if (!usedByDir.has(dirRel)) usedByDir.set(dirRel, new Set());
    const used = usedByDir.get(dirRel);

    let fileName = `${base}.webp`;
    let suffix = 2;
    while (used.has(fileName.toLowerCase())) {
      fileName = `${base}-${suffix}.webp`;
      suffix += 1;
    }
    used.add(fileName.toLowerCase());

    f.outName = fileName;
    f.outRel = dirRel === '.' ? fileName : `${dirRel}/${fileName}`;
    f.outAbs = path.join(outRoot, ...f.outRel.split('/'));
    f.renamed = fileName !== `${base}.webp`;
  }
  return files;
}

// ---------------------------------------------------------------------------
// 3. 单张图压缩
// ---------------------------------------------------------------------------
async function compressOne(file, ctx) {
  const preset = pickPreset(file.rel, file.ext);
  const isAnim = file.ext === '.gif';
  const rec = {
    srcRel: file.rel,
    outRel: file.outRel,
    srcExt: file.ext.replace('.', ''),
    preset: preset.name,
    maxEdge: preset.maxEdge,
    quality: preset.quality,
    renamed: file.renamed,
    animated: isAnim,
    ok: false,
  };

  try {
    const srcStat = await fsp.stat(file.abs);
    rec.srcBytes = srcStat.size;

    // --- 原图元数据（只读）------------------------------------------------
    const inMeta = await sharp(file.abs, { animated: isAnim }).metadata();
    if (!inMeta.width || !inMeta.height) throw new Error('无法读取原图尺寸（格式可能不受支持）');
    rec.srcWidth = inMeta.width;
    rec.srcHeight = inMeta.pageHeight ?? inMeta.height; // 动图取单帧逻辑高度
    rec.srcFrames = inMeta.pages ?? 1;
    rec.srcFormat = inMeta.format ?? rec.srcExt;
    rec.srcAlpha = Boolean(inMeta.hasAlpha);

    // --- 压缩：保持宽高比 + 长边限幅 + 小图不放大 + 保留 alpha -------------
    // 不调用 flatten()/removeAlpha()，PNG 的透明通道原样保留。
    const outBuf = await sharp(file.abs, { animated: isAnim })
      .resize({ width: preset.maxEdge, height: preset.maxEdge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: preset.quality, effort: preset.effort, alphaQuality: 100 })
      .toBuffer();
    rec.outBytes = outBuf.length;

    let outMeta;
    if (ctx.dryRun) {
      outMeta = await sharp(outBuf, { animated: isAnim }).metadata();
    } else {
      // 先写临时文件再原子改名：中途失败不会留下半截损坏的图片。
      await fsp.mkdir(path.dirname(file.outAbs), { recursive: true });
      const tmp = `${file.outAbs}.tmp-${process.pid}`;
      try {
        await fsp.writeFile(tmp, outBuf);
        await fsp.rename(tmp, file.outAbs); // Windows 上 rename 覆盖同名目标
      } catch (err) {
        await fsp.rm(tmp, { force: true }).catch(() => {});
        throw err;
      }
      outMeta = await sharp(file.outAbs, { animated: isAnim }).metadata();
    }

    rec.outWidth = outMeta.width ?? rec.srcWidth;
    rec.outHeight = outMeta.pageHeight ?? outMeta.height ?? rec.srcHeight;
    rec.outFrames = outMeta.pages ?? 1;
    rec.outAlpha = Boolean(outMeta.hasAlpha);
    rec.outLoop = outMeta.loop ?? null;
    rec.srcLoop = inMeta.loop ?? null;
    rec.srcDelayMs = totalDuration(inMeta);
    rec.outDelayMs = totalDuration(outMeta);
    rec.ok = true;
  } catch (err) {
    rec.error = err instanceof Error ? err.message : String(err);
  }
  return rec;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const srcRoot = path.resolve(opts.src);
  const outRoot = path.resolve(opts.out);
  const startedAt = Date.now();

  console.log('===============================================================');
  console.log('OC 素材批量压缩 batch-compress.mjs');
  console.log(`源目录（只读）：${srcRoot}`);
  console.log(`输出目录      ：${outRoot}`);
  console.log(`模式          ：${opts.dryRun ? 'dry-run（只统计，不写任何文件）' : '正式压缩'}`);
  console.log('===============================================================');

  // ---- 扫描 --------------------------------------------------------------
  const { files, skippedDirs, counters } = await collectFiles(srcRoot);
  planOutputs(files, outRoot);

  const targets = opts.limit > 0 ? files.slice(0, opts.limit) : files;
  const byPreset = { 静态图: 0, 表情包: 0, 动图: 0 };
  for (const f of targets) byPreset[pickPreset(f.rel, f.ext).name] += 1;

  console.log(`扫描到图片：${files.length} 张${opts.limit > 0 ? `（--limit：本次只处理前 ${targets.length} 张）` : ''}`);
  console.log(`分类：静态图 ${byPreset['静态图']} / 表情包 ${byPreset['表情包']}（长边 700 q80）/ 动图 ${byPreset['动图']}（长边 600 q75）`);
  console.log(`排除的子目录：${skippedDirs.length ? skippedDirs.join(' | ') : '（无）'}`);
  const extSummary = Object.entries(counters.filesByExt)
    .sort((a, b) => b[1] - a[1])
    .map(([e, n]) => `${e || '(无扩展名)'}×${n}`)
    .join('  ');
  console.log(`遍历到的全部文件类型（含被排除的）：${extSummary}`);
  const collisions = targets.filter((f) => f.renamed);
  if (collisions.length) {
    console.log(`同名冲突改名（同名不同扩展名）：${collisions.length} 张`);
    for (const c of collisions) console.log(`   ${c.rel} ⇒ ${c.outName}`);
  } else {
    console.log('同名冲突改名：无');
  }
  console.log('---------------------------------------------------------------');

  // ---- 逐张压缩（串行：内存可控、日志顺序稳定）--------------------------
  const records = [];
  const failures = [];
  for (let i = 0; i < targets.length; i += 1) {
    const rec = await compressOne(targets[i], { dryRun: opts.dryRun });
    if (rec.ok) {
      records.push(rec);
      const saved = rec.srcBytes - rec.outBytes;
      const p = pct(rec.srcBytes, rec.outBytes);
      const tag = rec.preset === '静态图' ? '' : `[${rec.preset}]`;
      console.log(
        `[${String(i + 1).padStart(3, ' ')}/${targets.length}] ${tag}${rec.outRel} | ` +
          `${rec.srcWidth}x${rec.srcHeight}${rec.srcFrames > 1 ? `×${rec.srcFrames}帧` : ''} ${formatBytes(rec.srcBytes)}` +
          ` → ${rec.outWidth}x${rec.outHeight}${rec.outFrames > 1 ? `×${rec.outFrames}帧` : ''} ${formatBytes(rec.outBytes)}` +
          ` (${p >= 0 ? `省 ${p.toFixed(1)}%` : `增 ${(-p).toFixed(1)}%`})`,
      );
    } else {
      failures.push(rec);
      console.warn(`[警告] 失败已跳过：${rec.srcRel}\n        原因：${rec.error}`);
    }
  }

  // ---- 汇总 --------------------------------------------------------------
  const totalSrc = records.reduce((s, r) => s + r.srcBytes, 0);
  const totalOut = records.reduce((s, r) => s + r.outBytes, 0);
  const totalSaved = totalSrc - totalOut;
  const totalPct = pct(totalSrc, totalOut);
  const grew = records.filter((r) => r.outBytes > r.srcBytes);
  const skippedCount = files.length - targets.length;

  console.log('===============================================================');
  console.log(`处理成功：${records.length} 张`);
  console.log(`处理失败：${failures.length} 张${failures.length ? '（明细见下）' : ''}`);
  console.log(`未处理（超出本次范围）：${skippedCount} 张`);
  console.log(`跳过的子目录：${skippedDirs.length} 个`);
  console.log(
    `总体积：${formatBytes(totalSrc)} → ${formatBytes(totalOut)}` +
      `（节省 ${formatBytes(totalSaved)}，总压缩率 ${totalPct.toFixed(2)}%）`,
  );
  console.log(`平均单张：${formatBytes(totalSrc / Math.max(records.length, 1))} → ${formatBytes(totalOut / Math.max(records.length, 1))}`);
  if (grew.length) {
    console.log(`压缩后反而变大：${grew.length} 张（均为此前已高度优化的 GIF，已按规格保留）`);
    for (const r of grew) {
      console.log(`   ${r.outRel} | ${formatBytes(r.srcBytes)} → ${formatBytes(r.outBytes)}（增 ${(-pct(r.srcBytes, r.outBytes)).toFixed(1)}%）`);
    }
  }
  if (failures.length) {
    console.log('失败明细：');
    for (const f of failures) console.log(`  - ${f.srcRel} => ${f.error}`);
  }
  console.log('===============================================================');

  // ---- 压缩收益 Top 10（只看真正变小的图）--------------------------------
  const top10 = records
    .filter((r) => r.outBytes < r.srcBytes)
    .sort((a, b) => (b.srcBytes - b.outBytes) - (a.srcBytes - a.outBytes))
    .slice(0, 10);
  console.log('压缩收益最高的 10 张（按节省体积从大到小）：');
  console.log('  排名 | 输出相对路径 | 原图 → 新图 | 节省体积 | 节省比例');
  top10.forEach((r, i) => {
    console.log(
      `  ${String(i + 1).padStart(3, ' ')} | ${r.outRel} | ${formatBytes(r.srcBytes)} → ${formatBytes(r.outBytes)} | ` +
        `${formatBytes(r.srcBytes - r.outBytes)} | ${pct(r.srcBytes, r.outBytes).toFixed(1)}%`,
    );
  });

  // ---- 动图前后对比校验 --------------------------------------------------
  const anims = records.filter((r) => r.animated);
  if (anims.length) {
    console.log('---------------------------------------------------------------');
    console.log('动图（GIF → 动画 WebP）前后对比校验：帧数 / 时长 / 循环 / 透明通道');
    for (const r of anims) {
      const framesOk = r.srcFrames === r.outFrames;
      const durOk = r.srcDelayMs != null && r.outDelayMs != null ? r.srcDelayMs === r.outDelayMs : null;
      const flags = [
        framesOk ? `帧数一致 ${r.outFrames}帧` : `帧数不一致 ${r.srcFrames}→${r.outFrames}`,
        durOk === null ? '时长未知' : durOk ? `时长一致 ${r.outDelayMs}ms` : `时长不一致 ${r.srcDelayMs}→${r.outDelayMs}ms`,
        r.srcLoop === r.outLoop ? `循环一致 loop=${r.outLoop}` : `循环变化 ${r.srcLoop}→${r.outLoop}`,
        r.srcAlpha === r.outAlpha ? `${r.outAlpha ? '含' : '无'}透明通道` : `透明通道变化 ${r.srcAlpha}→${r.outAlpha}`,
      ].join(' | ');
      console.log(
        `  ${r.outRel}\n     ${r.srcWidth}x${r.srcHeight} ${formatBytes(r.srcBytes)} → ${r.outWidth}x${r.outHeight} ` +
          `${formatBytes(r.outBytes)}（省 ${pct(r.srcBytes, r.outBytes).toFixed(1)}%）\n     ${flags}`,
      );
    }
  }

  // ---- 写 CSV 与报告 -----------------------------------------------------
  if (!opts.dryRun) {
    const header = ['相对源路径', '输出相对路径', '原格式', '原尺寸', '原体积KB', '新尺寸', '新体积KB', '节省百分比'];
    const lines = [header.join(',')];
    for (const r of records) {
      lines.push(
        [
          csvCell(r.srcRel),
          csvCell(r.outRel),
          csvCell(r.srcExt.toUpperCase()),
          csvCell(`${r.srcWidth}x${r.srcHeight}${r.srcFrames > 1 ? `(${r.srcFrames}帧)` : ''}`),
          kb(r.srcBytes),
          csvCell(`${r.outWidth}x${r.outHeight}${r.outFrames > 1 ? `(${r.outFrames}帧)` : ''}`),
          kb(r.outBytes),
          pct(r.srcBytes, r.outBytes).toFixed(2),
        ].join(','),
      );
    }
    const csvPath = path.resolve(opts.csv);
    await fsp.mkdir(path.dirname(csvPath), { recursive: true });
    // UTF-8 带 BOM（\ufeff），Excel 打开中文不乱码；CRLF 换行。
    await fsp.writeFile(csvPath, '\ufeff' + lines.join('\r\n') + '\r\n', 'utf8');

    const reportPath = path.resolve(opts.report);
    await fsp.mkdir(path.dirname(reportPath), { recursive: true });
    await fsp.writeFile(
      reportPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          srcRoot,
          outRoot,
          dryRun: opts.dryRun,
          elapsedMs: Date.now() - startedAt,
          successCount: records.length,
          failureCount: failures.length,
          notProcessedCount: skippedCount,
          skippedDirs,
          counters,
          byPreset,
          collisions: collisions.map((c) => ({ srcRel: c.rel, outRel: c.outRel })),
          totalSrcBytes: totalSrc,
          totalOutBytes: totalOut,
          totalSavedBytes: totalSaved,
          totalSavedPct: Number(totalPct.toFixed(2)),
          grewCount: grew.length,
          top10: top10.map((r) => ({ outRel: r.outRel, srcBytes: r.srcBytes, outBytes: r.outBytes, savedBytes: r.srcBytes - r.outBytes })),
          animated: anims,
          items: records,
          failures: failures.map((f) => ({ srcRel: f.srcRel, error: f.error })),
        },
        null,
        2,
      ),
      'utf8',
    );
    console.log('---------------------------------------------------------------');
    console.log(`CSV 已写入：${csvPath}`);
    console.log(`报告已写入：${reportPath}`);
  }

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
