#!/usr/bin/env node
/**
 * 把 glb 里的 alphaMode 从 BLEND 改成 MASK（带 alphaCutoff 0.5）。
 *
 *   node tools/patch-glb-alpha.mjs public/downloads/miaomiao.glb
 *
 * 为什么需要：Blender 5.3 的 glTF 导出器不再根据 blend_method 决定 alphaMode，
 * 材质一旦接了 Alpha 就统一导出 BLEND。而这张透明度贴图基本全不透明（均值 253/255），
 * BLEND 会让 three.js 关掉深度写入，面片按任意顺序叠在一起，浏览器里看就是"碎玻璃"。
 */

// 把 GLB 里的材质 alphaMode 从 BLEND 改成 MASK，并加 alphaCutoff。
// Blender 5.3 的 glTF 导出器不再看 blend_method，导出来一律 BLEND，
// 而这张透明度贴图基本全不透明（均值 253/255），BLEND 只会让 three 关掉深度写入、
// 面片乱序叠在一起（浏览器里看就是"碎玻璃"）。
const fs = require('fs');

const file = process.argv[2];
const buf = fs.readFileSync(file);

// GLB：magic(4) version(4) length(4) 然后若干 chunk：length(4) type(4) data
const magic = buf.readUInt32LE(0);
if (magic !== 0x46546c67) throw new Error('不是 GLB 文件');

let offset = 12;
const chunks = [];
while (offset < buf.length) {
	const len = buf.readUInt32LE(offset);
	const type = buf.readUInt32LE(offset + 4);
	const data = buf.subarray(offset + 8, offset + 8 + len);
	chunks.push({ type, data });
	offset += 8 + len;
}

const jsonChunk = chunks.find((c) => c.type === 0x4e4f534a);
if (!jsonChunk) throw new Error('没有 JSON chunk');

const gltf = JSON.parse(jsonChunk.data.toString('utf8'));
let changed = 0;
for (const mat of gltf.materials ?? []) {
	if (mat.alphaMode === 'BLEND') {
		mat.alphaMode = 'MASK';
		mat.alphaCutoff = 0.5;
		changed += 1;
	}
}
console.log('改了', changed, '个材质');

if (!changed) {
	console.log('没有 BLEND 材质，跳过');
	process.exit(0);
}

// 重新拼：JSON chunk 补空格到 4 字节对齐，BIN chunk 补 0
const newJson = Buffer.from(JSON.stringify(gltf), 'utf8');
const pad = (4 - (newJson.length % 4)) % 4;
const jsonPadded = Buffer.concat([newJson, Buffer.alloc(pad, 0x20)]);

const parts = [];
for (const chunk of chunks) {
	let data = chunk.data;
	if (chunk === jsonChunk) data = jsonPadded;
	else {
		const p = (4 - (data.length % 4)) % 4;
		if (p) data = Buffer.concat([data, Buffer.alloc(p, 0)]);
	}
	const head = Buffer.alloc(8);
	head.writeUInt32LE(data.length, 0);
	head.writeUInt32LE(chunk.type, 4);
	parts.push(head, data);
}

const body = Buffer.concat(parts);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + body.length, 8);
fs.writeFileSync(file, Buffer.concat([header, body]));
console.log('新体积', (fs.statSync(file).size / 1048576).toFixed(2), 'MB');
