/**
 * 会话持久化：IndexedDB 里一张表，一个会话一条记录。
 *
 * 服务端不存任何对话 —— 这是有意的。历史只在这台设备的这个浏览器里，
 * 换浏览器就重新开始。附件原件也不落盘（只存 file_id 和文件名），
 * 符合「只在网页端输出」的定位。
 */

import type { Session } from './types.ts';

const DB_NAME = 'aichat';
const DB_VERSION = 1;
const STORE = 'sessions';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
	if (typeof indexedDB === 'undefined') return Promise.resolve(null);
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE)) {
				db.createObjectStore(STORE, { keyPath: 'id' });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => resolve(null);
	});
	return dbPromise;
}

function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
	return openDb().then(
		(db) =>
			new Promise<T | null>((resolve) => {
				if (!db) return resolve(null);
				const tx = db.transaction(STORE, mode);
				const request = run(tx.objectStore(STORE));
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => resolve(null);
			}),
	);
}

export async function listSessions(): Promise<Session[]> {
	const rows = await transaction<Session[]>('readonly', (store) => store.getAll() as IDBRequest<Session[]>);
	if (!rows) return [];
	return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveSession(session: Session): Promise<unknown> {
	return transaction('readwrite', (store) => store.put(session));
}

export function deleteSession(id: string): Promise<unknown> {
	return transaction('readwrite', (store) => store.delete(id));
}

/** 用云端快照整包替换本地会话（先清空再写入，确认步骤由调用方负责） */
export async function replaceAllSessions(sessions: Session[]): Promise<void> {
	const db = await openDb();
	if (!db) return;
	await new Promise<void>((resolve) => {
		const tx = db.transaction(STORE, 'readwrite');
		const store = tx.objectStore(STORE);
		store.clear();
		for (const session of sessions) store.put(session);
		tx.oncomplete = () => resolve();
		tx.onerror = () => resolve();
		tx.onabort = () => resolve();
	});
}
