/**
 * WAV → MP3 批量转换（纯 JS，不依赖 ffmpeg 二进制）
 *
 * 用法：
 *   node tools/audio-to-mp3.mjs                     # 用同目录的 audio-manifest.json
 *   node tools/audio-to-mp3.mjs --manifest=<路径>
 *   node tools/audio-to-mp3.mjs --dry-run           # 只读元信息，不写文件
 *
 * 清单格式（JSON 数组）：
 *   [{ "src": "源 wav 绝对路径", "out": "public/audio/xx.mp3", "bitrate": 192 }]
 *
 * 支持的输入：PCM 16bit / PCM 24bit / PCM 32bit / IEEE float 32bit，单声道或双声道。
 * 输出：MP3（lamejs 编码），保留原采样率。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

/**
 * lamejs 1.2.1 的 Node 入口（src/js/index.js）在创建编码器时会用到几个
 * 只在浏览器打包版里才存在的全局变量，所以这里先手动注入再 require。
 * 包已 vendor 在 tools/vendor/lamejs（LGPL-3.0，见其 LICENSE）。
 */
const LAME_BASE = path.join(HERE, 'vendor', 'lamejs', 'src', 'js');
globalThis.MPEGMode = require(path.join(LAME_BASE, 'MPEGMode.js'));
globalThis.Lame = require(path.join(LAME_BASE, 'Lame.js'));
globalThis.BitStream = require(path.join(LAME_BASE, 'BitStream.js'));
globalThis.Encoder = require(path.join(LAME_BASE, 'Encoder.js'));
const lamejs = require(path.join(LAME_BASE, 'index.js'));

const argv = process.argv.slice(2);
const getArg = (name, fallback) => {
	const hit = argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.slice(name.length + 3) : fallback;
};
const dryRun = argv.includes('--dry-run');
const manifestPath = path.resolve(getArg('manifest', path.join(HERE, 'audio-manifest.json')));

/** 解析 WAV，返回 { sampleRate, channels, frames, read(frameIndex) } 形式的样本访问器 */
function openWav(file) {
	const buf = fs.readFileSync(file);
	if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
		throw new Error('不是标准 WAV 文件');
	}
	let offset = 12;
	let fmt = null;
	let dataOffset = 0;
	let dataSize = 0;
	while (offset + 8 <= buf.length) {
		const id = buf.toString('ascii', offset, offset + 4);
		const size = buf.readUInt32LE(offset + 4);
		if (id === 'fmt ') {
			fmt = {
				format: buf.readUInt16LE(offset + 8),
				channels: buf.readUInt16LE(offset + 10),
				sampleRate: buf.readUInt32LE(offset + 12),
				bits: buf.readUInt16LE(offset + 22),
			};
		} else if (id === 'data') {
			dataOffset = offset + 8;
			dataSize = size;
		}
		offset += 8 + size + (size % 2);
	}
	if (!fmt) throw new Error('缺少 fmt 块');
	if (!dataSize) throw new Error('缺少 data 块');

	const bytesPerSample = fmt.bits / 8;
	const frameBytes = bytesPerSample * fmt.channels;
	const frames = Math.floor(dataSize / frameBytes);
	if (!Number.isInteger(frames) || frames <= 0) throw new Error('data 块为空或长度异常');

	const isFloat = fmt.format === 3;
	const isPcm = fmt.format === 1;
	if (!isFloat && !isPcm) throw new Error(`不支持的编码格式 0x${fmt.format.toString(16)}`);

	return { buf, fmt, dataOffset, frames, bytesPerSample, frameBytes, isFloat };
}

/** 把整条声道解成 Int16Array（lamejs 需要 16bit PCM） */
function decodeChannel(wav, channelIndex) {
	const { buf, dataOffset, frames, bytesPerSample, frameBytes, isFloat, fmt } = wav;
	const out = new Int16Array(frames);
	const scale = fmt.bits === 16 ? 32768 : fmt.bits === 24 ? 8388608 : fmt.bits === 32 ? 2147483648 : 32768;

	for (let i = 0; i < frames; i += 1) {
		const base = dataOffset + i * frameBytes + channelIndex * bytesPerSample;
		let value;
		if (isFloat) {
			value = buf.readFloatLE(base);
			if (value > 1) value = 1;
			else if (value < -1) value = -1;
			out[i] = Math.round(value * 32767);
			continue;
		}
		if (fmt.bits === 16) {
			value = buf.readInt16LE(base) / scale;
		} else if (fmt.bits === 24) {
			// 24bit 小端有符号：补足符号位
			const raw = buf[base] | (buf[base + 1] << 8) | (buf[base + 2] << 16);
			value = (raw << 8 >> 8) / scale;
		} else if (fmt.bits === 32) {
			value = buf.readInt32LE(base) / scale;
		} else {
			throw new Error(`不支持的位深 ${fmt.bits}`);
		}
		let sample = Math.round(value * 32767);
		if (sample > 32767) sample = 32767;
		else if (sample < -32768) sample = -32768;
		out[i] = sample;
	}
	return out;
}

function encodeWavToMp3(src, out, bitrate) {
	const wav = openWav(src);
	const { fmt, frames } = wav;
	const channels = fmt.channels === 1 ? 1 : 2;
	const duration = frames / fmt.sampleRate;

	console.log(
		`  ${path.basename(src)}\n` +
			`     ${fmt.bits}bit ${wav.isFloat ? 'float' : 'PCM'} · ${fmt.channels}ch · ${fmt.sampleRate}Hz · ` +
			`${Math.floor(duration / 60)}分${(duration % 60).toFixed(1)}秒`,
	);

	if (dryRun) return { duration, bytes: 0 };

	const left = decodeChannel(wav, 0);
	const right = fmt.channels > 1 ? decodeChannel(wav, 1) : null;

	const encoder = new lamejs.Mp3Encoder(channels, fmt.sampleRate, bitrate);
	const CHUNK = 1152; // 一帧
	const parts = [];
	for (let i = 0; i < frames; i += CHUNK) {
		const l = left.subarray(i, Math.min(i + CHUNK, frames));
		const block = right ? encoder.encodeBuffer(l, right.subarray(i, Math.min(i + CHUNK, frames))) : encoder.encodeBuffer(l);
		if (block.length > 0) parts.push(Buffer.from(block));
	}
	const tail = encoder.flush();
	if (tail.length > 0) parts.push(Buffer.from(tail));

	const audio = Buffer.concat(parts);
	fs.mkdirSync(path.dirname(out), { recursive: true });
	fs.writeFileSync(out, audio);
	return { duration, bytes: audio.length };
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!Array.isArray(manifest)) {
	console.error('清单顶层必须是数组');
	process.exit(1);
}

console.log(`清单：${path.relative(ROOT, manifestPath)}（${manifest.length} 项）${dryRun ? ' · dry-run' : ''}\n`);

let ok = 0;
let failed = 0;
let totalSeconds = 0;
let totalBytes = 0;
const started = Date.now();

for (const item of manifest) {
	const src = path.resolve(item.src);
	const out = path.resolve(ROOT, item.out);
	const bitrate = item.bitrate ?? 192;
	try {
		if (!fs.existsSync(src)) throw new Error(`源文件不存在：${src}`);
		if (!out.startsWith(ROOT)) throw new Error(`输出路径越出项目目录：${out}`);
		const result = encodeWavToMp3(src, out, bitrate);
		totalSeconds += result.duration;
		totalBytes += result.bytes;
		ok += 1;
		if (!dryRun) {
			console.log(
				`     → ${path.relative(ROOT, out)}  ${(result.bytes / 1024 / 1024).toFixed(2)} MB  ` +
					`(${bitrate} kbps，约 ${(result.bytes / 1024 / result.duration).toFixed(0)} KB/s)`,
			);
		}
	} catch (err) {
		failed += 1;
		console.error(`  [失败] ${path.basename(src)}：${err.message}`);
	}
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
console.log(
	`\n===============================================================\n` +
		`成功 ${ok} 项 / 失败 ${failed} 项 · 总时长 ${Math.floor(totalSeconds / 60)} 分 ${(totalSeconds % 60).toFixed(1)} 秒\n` +
		`输出总体积 ${(totalBytes / 1024 / 1024).toFixed(2)} MB · 耗时 ${elapsed}s\n` +
		`===============================================================`,
);
process.exit(failed ? 1 : 0);
