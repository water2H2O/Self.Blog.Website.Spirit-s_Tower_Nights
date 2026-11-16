/**
 * 浏览器 → 自己后端的几个请求。
 *
 * 上传走的是同源 /api/aichat/files，由 Worker 带着服务端密钥转发给
 * Anthropic 兼容的 Files API。浏览器全程看不到 key，也看不到上游地址。
 */

import type { FileBlock } from './types.ts';
import { FILES_BETA, filesEndpointOf, describeUpstreamError } from './request.ts';
import type { Provider } from './request.ts';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;
const OCR_EXT = /\.(pdf|docx?|pptx?)$/i;

export type Purpose = 'user_data' | 'text_recognition' | 'rich_layout_recognition';

export type UploadedFile = { fileId: string; filename: string; bytes?: number; kind: 'image' | 'document' };

/** 图片一律 user_data；PDF/Office 走识别；其余（txt/md/csv/xlsx/epub…）也是 user_data */
export function pickPurpose(file: File): { purpose: Purpose; kind: 'image' | 'document' } {
	if (file.type.startsWith('image/') || IMAGE_EXT.test(file.name)) return { purpose: 'user_data', kind: 'image' };
	if (OCR_EXT.test(file.name)) return { purpose: 'text_recognition', kind: 'document' };
	return { purpose: 'user_data', kind: 'document' };
}

export function pickRichPurpose(file: File): Purpose {
	return OCR_EXT.test(file.name) ? 'rich_layout_recognition' : 'user_data';
}

export async function uploadFile(file: File, purpose: Purpose, provider?: Provider | null): Promise<UploadedFile> {
	const form = new FormData();
	// 顺序有讲究：文档解析要求 purpose 出现在 file 之前
	form.append('purpose', purpose);
	form.append('file', file, file.name);

	// 自定义接口多半没有 Files API，直接给一句人话，别让用户等到 404
	if (provider && provider.kind === 'custom') {
		throw new Error('自定义 API 暂不支持文件上传，请切换回官方 API 使用');
	}

	// 有官方 key 就浏览器直连上游；否则走同源代理（站点额度）
	const direct = Boolean(provider);
	const res = await fetch(direct ? filesEndpointOf() : '/api/aichat/files', {
		method: 'POST',
		credentials: 'same-origin',
		...(direct ? { headers: { 'x-api-key': (provider as Provider).apiKey, 'anthropic-beta': FILES_BETA } } : {}),
		body: form,
	});

	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new Error(data?.message ?? data?.error?.message ?? describeUpstreamError(res.status));
	}
	return {
		fileId: data.id ?? data.file_id,
		filename: data.filename ?? file.name,
		bytes: data.size_bytes ?? data.bytes,
		kind: purpose === 'user_data' && (file.type.startsWith('image/') || IMAGE_EXT.test(file.name)) ? 'image' : 'document',
	};
}

export function fileBlock(upload: { fileId: string; kind: 'image' | 'document' }): FileBlock {
	return {
		type: upload.kind === 'image' ? 'image' : 'document',
		source: { type: 'file', file_id: upload.fileId },
	};
}
