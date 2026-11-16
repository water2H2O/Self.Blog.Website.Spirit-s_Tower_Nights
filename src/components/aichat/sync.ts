/**
 * 云端快照（只有「站点口令」模式可用）。
 *
 * 整包上传、整包下载：会话文本 + 附件引用，不含图片原件。个人自用，
 * 一个对象 `sync/owner.json` 就够了，不需要按会话拆表。
 */

import type { Session } from './types.ts';

export type SyncSnapshot = { version?: number; savedAt: string | null; sessions: Session[] };

export async function pullSnapshot(): Promise<SyncSnapshot> {
	const res = await fetch('/api/aichat/sync', { credentials: 'same-origin' });
	if (!res.ok) {
		const data = await res.json().catch(() => ({}));
		throw new Error(data?.message ?? `读取失败（${res.status}）`);
	}
	return res.json();
}

export async function pushSnapshot(sessions: Session[]): Promise<{ savedAt: string; bytes: number }> {
	const res = await fetch('/api/aichat/sync', {
		method: 'PUT',
		credentials: 'same-origin',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ sessions }),
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new Error(data?.message ?? `上传失败（${res.status}）`);
	}
	return data;
}
