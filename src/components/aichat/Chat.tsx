/**
 * /aichat 的主界面。
 *
 * 两种取用方式，顶栏的下拉里随时切：
 *
 *   1. 自己的 API —— 可以存多个（官方 Key / 自定义兼容接口），
 *      key 只存在这个浏览器里，请求由浏览器直连上游，不经过本站服务器。
 *   2. 站点额度 —— 走同源的 /api/aichat/*，key 在 Worker 的 secret 里，
 *      浏览器完全看不到。只有拿到口令的人能用，也只有这条线能云端快照。
 *
 * 其余部分（会话、流式、搜索、文件、成本）两种模式共用。
 *
 * 几个刻意为之的地方：
 *   - 每条 user 消息发送时固化一条 latest_reminder（日期/星期/语言），并随历史
 *     回传。不回传的话每轮前缀都变，KV 缓存全落空，输入价翻 50 倍。
 *   - assistant 的 content 原样保存、原样回传：web_fetch_tool_result 的
 *     signature 一丢，之前读过的网页就不在后文上下文里了。
 *   - 流式更新按 80ms 节流，否则每来一个 token 重渲染整段 Markdown 会卡死主线程。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
	CSSProperties,
	ChangeEvent,
	DragEvent,
	FormEvent,
	KeyboardEvent,
	PointerEvent as ReactPointerEvent,
} from 'react';

import { fileBlock, pickPurpose, pickRichPurpose, uploadFile } from './api.ts';
import MessageView from './MessageView.tsx';
import ModelPicker from './ModelPicker.tsx';
import ProviderForm from './ProviderForm.tsx';
import { lockVault } from './vault.ts';
import Settings from './Settings.tsx';
import { deleteSession, listSessions, putSessions, replaceAllSessions, saveSession } from './db.ts';
import { collectSessions } from './importer.ts';
import {
	bodyOf,
	describeUpstreamError,
	endpointOf,
	headersOf,
	loadProviderState,
	maskKey,
	providerLabel,
	saveProviderState,
	supportsServerTools,
} from './request.ts';
import type { Provider, ProviderState } from './request.ts';
import { OpenAIStreamAssembler, StreamAssembler, toApiMessages } from './stream.ts';
import type { Assembler } from './stream.ts';
import { pullSnapshot, pushSnapshot } from './sync.ts';
import type { Attachment, ChatMessage, ChatOptions, Session, TextBlock } from './types.ts';

const OPTIONS_KEY = 'aichat:options';
const SIDE_COOKIE = 'aichat_side';
const SIDE_MIN = 160;
const SIDE_MAX = 380;

/** 侧栏宽度存 cookie（用户要求）：存的是像素数，下次打开沿用 */
function readSideWidth(): number {
	try {
		const match = document.cookie.match(new RegExp(`(?:^|; )${SIDE_COOKIE}=(\\d+)`));
		if (match) {
			const value = Number(match[1]);
			if (Number.isFinite(value)) return Math.min(SIDE_MAX, Math.max(SIDE_MIN, value));
		}
	} catch {
		/* cookie 读不到就用默认值 */
	}
	return 196;
}

function writeSideWidth(width: number): void {
	try {
		document.cookie = `${SIDE_COOKIE}=${Math.round(width)}; path=/; max-age=31536000; SameSite=Lax`;
	} catch {
		/* 忽略 */
	}
}

type GroupKey = 'today' | 'yesterday' | 'week' | 'older';

const GROUPS: { key: GroupKey; label: string }[] = [
	{ key: 'today', label: '今天' },
	{ key: 'yesterday', label: '昨天' },
	{ key: 'week', label: '7 天内' },
	{ key: 'older', label: '更早' },
];

function dayStart(ts: number): number {
	const date = new Date(ts);
	date.setHours(0, 0, 0, 0);
	return date.getTime();
}

function groupOf(ts: number): GroupKey {
	const today = dayStart(Date.now());
	const day = 24 * 60 * 60 * 1000;
	if (ts >= today) return 'today';
	if (ts >= today - day) return 'yesterday';
	if (ts >= today - 6 * day) return 'week';
	return 'older';
}

function newId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function weekdayCN(date: Date): string {
	return ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][date.getDay()];
}

/** 网页端同款元信息串：<date>,<weekday>,<location>,<platform>,<language> */
function buildReminder(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	const lang = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh') ? '中文' : 'English';
	return `${date},${weekdayCN(now)},中国,Web,${lang}`;
}

function loadOptions(): ChatOptions {
	const fallback: ChatOptions = { thinking: true, webSearch: true, readUrl: true, richLayout: true };
	try {
		const raw = localStorage.getItem(OPTIONS_KEY);
		if (!raw) return fallback;
		return { ...fallback, ...JSON.parse(raw), readUrl: true, richLayout: true };
	} catch {
		return fallback;
	}
}

function makeSession(): Session {
	const now = Date.now();
	return { id: newId(), title: '新对话', createdAt: now, updatedAt: now, messages: [] };
}

function titleFrom(messages: ChatMessage[]): string {
	const first = messages.find((message) => message.role === 'user');
	if (!first) return '新对话';
	const text = first.content
		.filter((block): block is TextBlock => block.type === 'text')
		.map((block) => block.text)
		.join(' ')
		.trim();
	if (!text) return first.attachments?.length ? `附件：${first.attachments[0].name}` : '新对话';
	return text.length > 24 ? `${text.slice(0, 24)}…` : text;
}

export default function Chat() {
	const [booted, setBooted] = useState(false);
	const [serverAuthed, setServerAuthed] = useState(false);
	const [providers, setProviders] = useState<ProviderState>({ list: [], activeId: null });

	const [password, setPassword] = useState('');
	const [loginError, setLoginError] = useState('');
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const [syncing, setSyncing] = useState(false);
	const [syncMessage, setSyncMessage] = useState('');
	const [importing, setImporting] = useState(false);
	const [importMessage, setImportMessage] = useState('');

	const [sessions, setSessions] = useState<Session[]>([]);
	const [currentId, setCurrentId] = useState<string | null>(null);
	const [options, setOptions] = useState<ChatOptions>({ thinking: true, webSearch: true, readUrl: true, richLayout: true });
	const [input, setInput] = useState('');
	const [pending, setPending] = useState<Attachment[]>([]);
	const [uploading, setUploading] = useState(false);
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState('');
	const [dragging, setDragging] = useState(false);
	const [railOpen, setRailOpen] = useState(false);
	const [sideWidth, setSideWidth] = useState(196);

	const abortRef = useRef<AbortController | null>(null);
	const scrollerRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);
	const fileRef = useRef<HTMLInputElement | null>(null);
	const sessionsRef = useRef<Session[]>([]);

	sessionsRef.current = sessions;

	const active = useMemo(
		() => providers.list.find((provider) => provider.id === providers.activeId) ?? null,
		[providers],
	);
	const ready = Boolean(active) || serverAuthed;
	const tools = supportsServerTools(active);
	const current = useMemo(() => sessions.find((session) => session.id === currentId) ?? null, [sessions, currentId]);
	const messages = current?.messages ?? [];
	const accountName = active ? providerLabel(active) : '站点额度';
	const accountSub = active ? maskKey(active.apiKey) : serverAuthed ? '已登录' : '未配置';

	// ---------------------------------------------------------------- 启动

	useEffect(() => {
		setOptions(loadOptions());
		setSideWidth(readSideWidth());
	}, []);

	useEffect(() => {
		writeSideWidth(sideWidth);
	}, [sideWidth]);

	useEffect(() => {
		try {
			localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
		} catch {
			/* 隐私模式下写不进去，忽略 */
		}
	}, [options]);

	useEffect(() => {
		const saved = loadProviderState();
		if (saved.list.length > 0) {
			setProviders(saved);
			setBooted(true);
			// 有 Key 也可能同时有站点会话（云端快照要用），顺手确认一下
			fetch('/api/aichat/session', { credentials: 'same-origin' })
				.then((res) => res.json())
				.then((data) => setServerAuthed(Boolean(data?.authed)))
				.catch(() => undefined);
			return;
		}
		let alive = true;
		fetch('/api/aichat/session', { credentials: 'same-origin' })
			.then((res) => res.json())
			.then((data) => {
				if (!alive) return;
				setServerAuthed(Boolean(data?.authed));
				setBooted(true);
			})
			.catch(() => {
				if (alive) setBooted(true);
			});
		return () => {
			alive = false;
		};
	}, []);

	useEffect(() => {
		if (!ready) return;
		let alive = true;
		listSessions().then((rows) => {
			if (!alive) return;
			setSessions(rows);
			setCurrentId((id) => id ?? rows[0]?.id ?? null);
		});
		return () => {
			alive = false;
		};
	}, [ready]);

	// 会话内容变化后延迟落盘：流式期间不至于每个 token 写一次 IndexedDB
	useEffect(() => {
		if (!currentId) return;
		const timer = window.setTimeout(() => {
			const session = sessionsRef.current.find((item) => item.id === currentId);
			if (session) void saveSession(session);
		}, 800);
		return () => window.clearTimeout(timer);
	}, [sessions, currentId]);

	useEffect(() => {
		const el = scrollerRef.current;
		const last = messages[messages.length - 1];
		const writing = last?.role === 'assistant' && last.content.some((b) => b.type === 'text' && b.text.length > 0);
		if (el && !writing) el.scrollTop = el.scrollHeight;
	}, [messages]);

	const patchSession = useCallback((sessionId: string, updater: (session: Session) => Session) => {
		setSessions((prev) =>
			prev.map((session) => (session.id === sessionId ? { ...updater(session), updatedAt: Date.now() } : session)),
		);
	}, []);

	// 站点额度：空闲时合并云端再上传，避免用过期本地快照直接覆盖其它设备。
	const autoSyncLock = useRef(false);
	const lastSyncSignature = useRef('');
	useEffect(() => {
		if (!booted || !serverAuthed || active || busy || importing) return;
		let disposed = false;
		const synchronize = async () => {
			if (autoSyncLock.current || document.visibilityState === 'hidden') return;
			autoSyncLock.current = true;
			setSyncing(true);
			try {
				const remote = await pullSnapshot();
				if (disposed) return;
				const local = await listSessions();
				const merged = new Map<string, Session>();
				for (const row of [...remote.sessions, ...local, ...sessionsRef.current]) {
					const prev = merged.get(row.id);
					if (!prev || row.updatedAt >= prev.updatedAt) merged.set(row.id, row);
				}
				const rows = [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt);
				const signature = JSON.stringify(rows);
				await putSessions(rows);
				if (disposed) return;
				if (JSON.stringify(sessionsRef.current) !== signature) setSessions(rows);
				setCurrentId((id) => id ?? rows[0]?.id ?? null);
				if (signature !== lastSyncSignature.current || JSON.stringify(remote.sessions) !== signature) {
					await pushSnapshot(rows);
				}
				lastSyncSignature.current = signature;
				setSyncMessage(`已自动同步 ${rows.length} 个会话 · ${new Date().toLocaleTimeString()}`);
			} catch (error) {
				if (!disposed) setSyncMessage(`自动同步失败，数据仍保留在本机：${String((error as Error)?.message ?? error)}`);
			} finally {
				autoSyncLock.current = false;
				setSyncing(false);
			}
		};
		// 对话结束/本地变更后留出 IndexedDB 写入时间，再同步。
		const timer = window.setTimeout(() => void synchronize(), 1500);
		const interval = window.setInterval(() => void synchronize(), 60000);
		const onVisible = () => { if (document.visibilityState === 'visible') void synchronize(); };
		window.addEventListener('online', onVisible);
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			disposed = true;
			window.clearTimeout(timer);
			window.clearInterval(interval);
			window.removeEventListener('online', onVisible);
			document.removeEventListener('visibilitychange', onVisible);
		};
	}, [booted, serverAuthed, active, busy, importing, sessions]);

	// ---------------------------------------------------------------- 配置

	const persistProviders = useCallback((next: ProviderState) => {
		saveProviderState(next);
		setProviders(next);
	}, []);

	const saveProviderAndActivate = useCallback(
		(provider: Provider) => {
			setProviders((prev) => {
				const exists = prev.list.some((item) => item.id === provider.id);
				const list = exists ? prev.list.map((item) => (item.id === provider.id ? provider : item)) : [...prev.list, provider];
				const next = { list, activeId: provider.id };
				saveProviderState(next);
				return next;
			});
			setPending([]);
		},
		[],
	);

	const deleteProvider = useCallback((id: string) => {
		setProviders((prev) => {
			const list = prev.list.filter((item) => item.id !== id);
			const activeId = prev.activeId === id ? (list[0]?.id ?? null) : prev.activeId;
			const next = { list, activeId };
			saveProviderState(next);
			return next;
		});
	}, []);

	const activate = useCallback((id: string | null) => {
		setProviders((prev) => {
			const next = { ...prev, activeId: id };
			saveProviderState(next);
			return next;
		});
		setPending([]);
	}, []);

	const login = useCallback(
		async (event: FormEvent) => {
			event.preventDefault();
			setLoginError('');
			try {
				const res = await fetch('/api/aichat/login', {
					method: 'POST',
					credentials: 'same-origin',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ password }),
				});
				const data = await res.json().catch(() => ({}));
				if (!res.ok) {
					setLoginError(data?.message ?? `登录失败（${res.status}）`);
					return;
				}
				setServerAuthed(true);
				setPassword('');
			} catch (error) {
				setLoginError(String((error as Error)?.message ?? error));
			}
		},
		[password],
	);

	const signOut = useCallback(async () => {
		lockVault();
		setProviders({ list: [], activeId: null });
		await fetch('/api/aichat/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => null);
		setServerAuthed(false);
		if (!active) {
			setSessions([]);
			setCurrentId(null);
		}
		setSettingsOpen(false);
		setMenuOpen(false);
	}, [active]);

	// ---------------------------------------------------------------- 云端快照

	const pushToServer = useCallback(async () => {
		setSyncing(true);
		setSyncMessage('');
		try {
			const rows = sessionsRef.current;
			const result = await pushSnapshot(rows);
			setSyncMessage(`已上传 ${rows.length} 个会话（${new Date(result.savedAt).toLocaleString()}）`);
		} catch (error) {
			setSyncMessage(String((error as Error)?.message ?? error));
		} finally {
			setSyncing(false);
		}
	}, []);

	const pullFromServer = useCallback(async () => {
		if (!window.confirm('会用服务器上的快照覆盖本机全部会话，确定吗？')) return;
		setSyncing(true);
		setSyncMessage('');
		try {
			const snapshot = await pullSnapshot();
			const rows = (snapshot.sessions ?? []).slice().sort((a, b) => b.updatedAt - a.updatedAt);
			await replaceAllSessions(rows);
			setSessions(rows);
			setCurrentId(rows[0]?.id ?? null);
			setSyncMessage(
				rows.length > 0
					? `已恢复 ${rows.length} 个会话${snapshot.savedAt ? `（${new Date(snapshot.savedAt).toLocaleString()}）` : ''}`
					: '服务器上还没有数据',
			);
		} catch (error) {
			setSyncMessage(String((error as Error)?.message ?? error));
		} finally {
			setSyncing(false);
		}
	}, []);

	// ---------------------------------------------------------------- 导入官方导出

	const importFiles = useCallback(async (list: FileList | File[]) => {
		const files = Array.from(list).filter((file) => file.name.toLowerCase().endsWith('.json'));
		if (files.length === 0) {
			setImportMessage('没选中 .json 文件 —— 请选解压后的 chat_sessions 文件夹');
			return;
		}
		setImporting(true);
		setImportMessage('');
		try {
			const texts: { name: string; text: string }[] = [];
			for (const file of files) {
				// 单个会话 JSON 正常都在几 MB 内；异常大的直接跳过，避免卡死
				if (file.size > 16 * 1024 * 1024) continue;
				texts.push({ name: file.name, text: await file.text() });
			}
			const existing = new Set(sessionsRef.current.map((session) => session.id));
			const { sessions: imported, summary } = collectSessions(texts, existing);
			await putSessions(imported);

			const merged = [...imported, ...sessionsRef.current].sort((a, b) => b.updatedAt - a.updatedAt);
			setSessions(merged);
			setCurrentId(merged[0]?.id ?? null);

			const parts = [
				`导入 ${summary.sessions} 个会话、${summary.messages} 条消息`,
				summary.archives > 0 ? `另有 ${summary.archives} 个分叉会话生成了「全部分支」副本` : '',
				summary.skipped > 0 ? `跳过 ${summary.skipped} 个（已存在或为空）` : '',
				summary.droppedFiles > 0 ? `附件只记录了 ${summary.droppedFiles} 个文件名` : '',
			].filter(Boolean);
			setImportMessage(`${parts.join('；')}。`);
		} catch (error) {
			setImportMessage(`导入失败：${String((error as Error)?.message ?? error)}`);
		} finally {
			setImporting(false);
		}
	}, []);

	// ---------------------------------------------------------------- 会话

	const startSession = useCallback(() => {
		const session = makeSession();
		setSessions((prev) => [session, ...prev]);
		setCurrentId(session.id);
		setRailOpen(false);
		inputRef.current?.focus();
	}, []);

	const removeSession = useCallback(
		async (id: string) => {
			await deleteSession(id);
			setSessions((prev) => {
				const next = prev.filter((session) => session.id !== id);
				if (currentId === id) setCurrentId(next[0]?.id ?? null);
				return next;
			});
		},
		[currentId],
	);

	const stop = useCallback(() => {
		abortRef.current?.abort();
		abortRef.current = null;
		setBusy(false);
		setNotice('');
	}, []);

	const togglePin = useCallback(async (id: string) => {
		const target = sessionsRef.current.find((session) => session.id === id);
		if (!target) return;
		const next: Session = { ...target, pinned: !target.pinned, updatedAt: Date.now() };
		await saveSession(next);
		setSessions((prev) => prev.map((session) => (session.id === id ? next : session)));
	}, []);

	/** 拖动侧栏右缘调宽度：拖动时只改 CSS 变量，松手才落 cookie */
	const startResize = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			event.preventDefault();
			const startX = event.clientX;
			const startWidth = sideWidth;
			const onMove = (moveEvent: PointerEvent) => {
				setSideWidth(Math.min(SIDE_MAX, Math.max(SIDE_MIN, startWidth + moveEvent.clientX - startX)));
			};
			const onUp = () => {
				window.removeEventListener('pointermove', onMove);
				window.removeEventListener('pointerup', onUp);
			};
			window.addEventListener('pointermove', onMove);
			window.addEventListener('pointerup', onUp);
		},
		[sideWidth],
	);

	// ---------------------------------------------------------------- 一轮对话

	const runTurn = useCallback(
		async (sessionId: string, history: ChatMessage[], opts: ChatOptions, provider: Provider | null) => {
			const assistantId = newId();
			const assistant: ChatMessage = {
				id: assistantId,
				role: 'assistant',
				content: [],
				streaming: true,
				createdAt: Date.now(),
			};
			patchSession(sessionId, (session) => ({ ...session, messages: [...history, assistant] }));

			const controller = new AbortController();
			abortRef.current = controller;
			setBusy(true);
			setNotice('');

			const wire = toApiMessages(history);
			const useOpenAI = provider?.kind === 'custom' && provider.protocol === 'openai';
			const assembler: Assembler = useOpenAI ? new OpenAIStreamAssembler() : new StreamAssembler();

			let flushTimer: number | null = null;

			const flush = (final: boolean) => {
				if (flushTimer !== null) {
					window.clearTimeout(flushTimer);
					flushTimer = null;
				}
				const blocks = assembler.collect();
				const usage = assembler.done || final ? assembler.usage : undefined;
				patchSession(sessionId, (session) => ({
					...session,
					messages: session.messages.map((message) =>
						message.id === assistantId
							? {
									...message,
									content: blocks,
									streaming: !final,
									usage,
									stopReason: assembler.stopReason,
									error: assembler.error ?? message.error,
								}
							: message,
					),
					...(assembler.title ? { title: assembler.title } : {}),
				}));
			};

			const schedule = () => {
				if (flushTimer !== null) return;
				flushTimer = window.setTimeout(() => flush(false), 80);
			};

			try {
				// 选了自己的接口就浏览器直连；否则走同源代理（服务端收窄 + 记日志）
				const res = provider
					? await fetch(endpointOf(provider), {
							method: 'POST',
							signal: controller.signal,
							credentials: 'omit',
							headers: headersOf(provider, wire),
							body: JSON.stringify(bodyOf(provider, wire, opts)),
						})
					: await fetch('/api/aichat/chat', {
							method: 'POST',
							credentials: 'same-origin',
							signal: controller.signal,
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({
								messages: wire,
								thinking: { type: opts.thinking ? 'enabled' : 'disabled' },
								...(opts.webSearch || opts.readUrl
									? {
											tools: [
												...(opts.webSearch ? [{ type: 'deepseek_web_search', name: 'deepseek_web_search' }] : []),
												...(opts.readUrl ? [{ type: 'deepseek_read_url', name: 'deepseek_read_url' }] : []),
											],
										}
									: {}),
								title: { enabled: true },
							}),
						});

				if (!res.ok || !res.body) {
					let message = `请求失败（${res.status}）`;
					if (provider) {
						const detail = await res.text().catch(() => '');
						message = describeUpstreamError(res.status, detail);
					} else {
						const data = await res.json().catch(() => ({}));
						if (res.status === 401) setServerAuthed(false);
						message = data?.message ?? message;
					}
					patchSession(sessionId, (session) => ({
						...session,
						messages: session.messages.map((item) =>
							item.id === assistantId ? { ...item, streaming: false, error: message } : item,
						),
					}));
					return;
				}

				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					if (assembler.push(decoder.decode(value, { stream: true }))) schedule();
				}
				flush(true);
			} catch (error) {
				const aborted = (error as Error)?.name === 'AbortError';
				patchSession(sessionId, (session) => ({
					...session,
					messages: session.messages.map((item) =>
						item.id === assistantId
							? {
									...item,
									streaming: false,
									content: assembler.collect(),
									usage: assembler.usage,
									stopReason: assembler.stopReason,
									error: aborted
										? undefined
										: provider
											? `直连失败：${String((error as Error)?.message ?? error)}（网络或跨域预检被拒绝；请让 API 服务商允许本站 Origin 和 OPTIONS 请求，切换协议不能绕过 CORS）`
											: String((error as Error)?.message ?? error),
								}
							: item,
					),
				}));
			} finally {
				abortRef.current = null;
				setBusy(false);
				setNotice('');
			}
		},
		[patchSession],
	);

	const send = useCallback(async () => {
		const text = input.trim();
		if (busy || uploading) return;
		if (!text && pending.length === 0) return;

		const blocks: ChatMessage['content'] = pending.map((attachment) => fileBlock(attachment));
		if (text) blocks.push({ type: 'text', text });

		const userMessage: ChatMessage = {
			id: newId(),
			role: 'user',
			content: blocks,
			reminder: buildReminder(),
			attachments: pending.length > 0 ? pending : undefined,
			createdAt: Date.now(),
		};

		const base = current ?? makeSession();
		const history = [...base.messages, userMessage];
		if (!current) {
			const fresh: Session = { ...base, title: titleFrom([userMessage]), messages: history, updatedAt: Date.now() };
			setSessions((prev) => [fresh, ...prev]);
			setCurrentId(fresh.id);
		} else {
			patchSession(base.id, (session) => ({ ...session, messages: history }));
		}

		setInput('');
		setPending([]);
		await runTurn(base.id, history, options, active);
	}, [busy, uploading, input, pending, current, options, patchSession, runTurn, active]);

	const regenerate = useCallback(
		(message: ChatMessage) => {
			if (!current || busy) return;
			const index = current.messages.findIndex((item) => item.id === message.id);
			if (index <= 0) return;
			const branch: Session = { ...makeSession(), title: `${current.title} · 分支`, messages: current.messages.slice(0, index) };
			setSessions((prev) => [branch, ...prev]);
			setCurrentId(branch.id);
			void saveSession(branch);
			void runTurn(branch.id, branch.messages, options, active);
		},
		[busy, current, options, runTurn, active],
	);

	const editMessage = (message: ChatMessage) => {
		if (!current || busy) return;
		const index = current.messages.findIndex((m) => m.id === message.id);
		const original = message.content.filter((b): b is TextBlock => b.type === 'text').map((b) => b.text).join('\n');
		const text = window.prompt('修改提问：将创建新分支，原对话保留', original);
		if (!text?.trim() || index < 0) return;
		const edited: ChatMessage = { ...message, id: newId(), content: [...message.content.filter((b) => b.type !== 'text'), { type: 'text', text: text.trim() }] };
		const branch: Session = { ...makeSession(), title: `${current.title} · 分支`, messages: [...current.messages.slice(0, index), edited] };
		setSessions((prev) => [branch, ...prev]);
		setCurrentId(branch.id);
		void saveSession(branch);
		void runTurn(branch.id, branch.messages, options, active);
	};

	const renameSession = async (session: Session) => {
		const title = window.prompt('会话名称', session.title);
		if (!title?.trim()) return;
		const renamed = { ...session, title: title.trim(), updatedAt: Date.now() };
		await saveSession(renamed);
		setSessions((prev) => prev.map((s) => s.id === renamed.id ? renamed : s));
	};

	const attachFiles = useCallback(
		async (files: FileList | File[]) => {
			const list = Array.from(files);
			if (list.length === 0) return;
			if (active && active.kind === 'custom') {
				setNotice('自定义 API 不支持文件上传');
				return;
			}
			setUploading(true);
			setNotice('');
			try {
				const uploaded: Attachment[] = [];
				for (const file of list) {
					const base = pickPurpose(file);
					const purpose = base.kind === 'document' ? pickRichPurpose(file) : base.purpose;
					const stored = await uploadFile(file, purpose, active);
					uploaded.push({ fileId: stored.fileId, name: stored.filename, kind: stored.kind, bytes: stored.bytes });
				}
				setPending((prev) => [...prev, ...uploaded]);
			} catch (error) {
				setNotice(String((error as Error)?.message ?? error));
			} finally {
				setUploading(false);
			}
		},
		[options.richLayout, active],
	);

	const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
		if (event.target.files) void attachFiles(event.target.files);
		event.target.value = '';
	};

	const onDrop = (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		setDragging(false);
		if (event.dataTransfer?.files?.length) void attachFiles(event.dataTransfer.files);
	};

	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
			event.preventDefault();
			void send();
		}
	};

	// ---------------------------------------------------------------- 首次进入

	if (!booted) {
		return (
			<div className="ac-app ac-app-boot">
				<div className="ac-loading">正在检查配置…</div>
			</div>
		);
	}

	if (!ready) {
		return (
			<div className="ac-app ac-app-boot">
				<div className="ac-gate">
					<h1 className="ac-gate-title">Deepsleep-水塔特供</h1>
					<p className="ac-gate-desc">
						<del>水水自己</del>和 deepseek 一起写的网页版 AI 工具，
						使用 deepseek 官方开源的 chat 仓库搭建。
						<br />
						输入自己的 API key 即可开始使用。
					</p>
					<p className="ac-gate-privacy">
						Key 只存本地，请求由浏览器直连上游，本站服务器不接手！
					</p>
					<div className="ac-gate-card">
						<ProviderForm initial={null} onSave={saveProviderAndActivate} submitLabel="开始使用" />
					</div>

					<details className="ac-gate-alt">
						<summary>或者用站点额度进入（需要口令）</summary>
						<form className="ac-gate-alt-form" onSubmit={login}>
							<input
								type="password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								placeholder="口令"
								autoComplete="current-password"
							/>
							<button type="submit" disabled={password.length === 0}>
								进入
							</button>
							{loginError && <p className="ac-error">{loginError}</p>}
						</form>
					</details>
				</div>
			</div>
		);
	}

	// ---------------------------------------------------------------- 主界面

	const byUpdated = (a: Session, b: Session) => b.updatedAt - a.updatedAt;
	const pinnedSessions = sessions.filter((session) => session.pinned).sort(byUpdated);
	const grouped = GROUPS.map((group) => ({
		...group,
		items: sessions.filter((session) => !session.pinned && groupOf(session.updatedAt) === group.key).sort(byUpdated),
	}));

	const renderSessionRow = (session: Session) => (
		<div className={`ac-session${session.id === currentId ? ' ac-session-on' : ''}`} key={session.id}>
			<button
				className="ac-session-title"
				type="button"
				onClick={() => {
					setCurrentId(session.id);
					setRailOpen(false);
				}}
			>
				{session.title}
			</button>
			<button
				className={`ac-session-pin${session.pinned ? ' ac-session-pin-on' : ''}`}
				type="button"
				title={session.pinned ? '取消置顶' : '置顶'}
				aria-label={session.pinned ? '取消置顶' : '置顶'}
				onClick={() => void togglePin(session.id)}
			>
				{session.pinned ? '★' : '☆'}
			</button>
			<button className="ac-text-btn" type="button" title="重命名会话" onClick={() => void renameSession(session)}>✎</button>
			<button className="ac-session-del" type="button" title="删除" onClick={() => void removeSession(session.id)}>
				×
			</button>
		</div>
	);

	return (
		<div
			className={`ac-app${railOpen ? ' ac-rail-open' : ''}`}
			style={{ ['--ac-side-w' as string]: `${sideWidth}px` } as React.CSSProperties}
		>
			<aside className="ac-side">
				<button className="ac-new" type="button" onClick={startSession}>
					＋ 新对话
				</button>

				<div className="ac-session-list">
					{pinnedSessions.length > 0 && <p className="ac-group">置顶</p>}
					{pinnedSessions.map(renderSessionRow)}

					{grouped.map((group) => (
						<div className="ac-group-block" key={group.key}>
							{group.items.length > 0 && <p className="ac-group">{group.label}</p>}
							{group.items.map(renderSessionRow)}
						</div>
					))}

					{sessions.length === 0 && <p className="ac-side-empty">还没有对话</p>}
				</div>

				<div className="ac-account">
					{menuOpen && (
						<div className="ac-account-menu" role="menu">
							<button
								type="button"
								role="menuitem"
								onClick={() => {
									setMenuOpen(false);
									setSettingsOpen(true);
								}}
							>
								设置
							</button>
							<button
								type="button"
								role="menuitem"
								onClick={() => {
									setMenuOpen(false);
									void signOut();
								}}
							>
								退出登录
							</button>
						</div>
					)}
					<button className="ac-account-btn" type="button" onClick={() => setMenuOpen((open) => !open)}>
						<span className="ac-avatar" aria-hidden="true" />
						<span className="ac-account-text">
							<strong>{accountName}</strong>
							<em>{accountSub}</em>
						</span>
					</button>
				</div>

				{/* 拖这个 6px 的边调侧栏宽度，松手写进 cookie */}
				<div className="ac-resizer" role="separator" aria-orientation="vertical" onPointerDown={startResize} />
			</aside>

			{railOpen && <button className="ac-sidebar-backdrop" aria-label="关闭侧边栏" onClick={() => setRailOpen(false)} />}
			<section className="ac-main">
				<div className="ac-bar">
					<button className="ac-rail-toggle" type="button" onClick={() => setRailOpen((open) => !open)} aria-label="会话列表">
						☰
					</button>
					<span className="ac-title">Deepsleep-水塔特供</span>
					<span className="ac-hint">{busy ? '生成中…' : 'Enter 发送 · Shift+Enter 换行'}</span>
				</div>

				<div className="ac-scroll" ref={scrollerRef}>
					{messages.length === 0 && (
						<div className="ac-empty">
							<p className="ac-empty-title">问点什么吧</p>
							<p className="ac-empty-desc">
								{tools
									? '可以联网、读链接、上传图片和文档；历史只存在这台设备的浏览器里。'
									: '自定义接口按纯文本对话使用；联网、读链接、文件上传需要官方 API。'}
							</p>
						</div>
					)}
					{messages.map((message, index) => (
						<MessageView
							key={message.id}
							message={message}
							showCost={!active || active.kind === 'deepseek'}
							onRegenerate={!busy && message.role === 'assistant' ? regenerate : undefined}
							onEdit={!busy && message.role === 'user' ? editMessage : undefined}
						/>
					))}
				</div>

				{notice && <p className="ac-notice">{notice}</p>}

				<div
					className={`ac-composer${dragging ? ' ac-dragging' : ''}`}
					onDragOver={(event) => {
						event.preventDefault();
						setDragging(true);
					}}
					onDragLeave={() => setDragging(false)}
					onDrop={onDrop}
				>
					{pending.length > 0 && (
						<div className="ac-attach-list">
							{pending.map((attachment) => (
								<span className="ac-attach" key={attachment.fileId}>
									{attachment.kind === 'image' ? '图片' : '文档'} · {attachment.name}
									<button
										type="button"
										onClick={() => setPending((prev) => prev.filter((item) => item.fileId !== attachment.fileId))}
										aria-label="移除附件"
									>
										×
									</button>
								</span>
							))}
						</div>
					)}

					<div className="ac-composer-row">
						<textarea
							ref={inputRef}
							value={input}
							rows={2}
							placeholder={uploading ? '正在上传…' : '说点什么，或把文件拖进来…'}
							onChange={(event) => setInput(event.target.value)}
							onKeyDown={onKeyDown}
							onPaste={(event) => {
								const files = event.clipboardData?.files;
								if (files && files.length > 0) {
									event.preventDefault();
									void attachFiles(files);
								}
							}}
							disabled={busy}
						/>
						<div className="ac-side-btns">
							<button
								className="ac-icon-btn"
								type="button"
								title={tools ? '添加文件' : '自定义 API 不支持文件上传'}
								onClick={() => fileRef.current?.click()}
								disabled={busy || uploading || !tools}
							>
								＋
							</button>
							<input
								ref={fileRef}
								type="file"
								multiple
								hidden
								onChange={onFileChange}
								accept="image/jpeg,image/png,image/gif,image/webp,.pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.csv,.json,.xlsx,.epub"
							/>
							{busy ? (
								<button className="ac-send ac-stop" type="button" onClick={stop}>
									停止
								</button>
							) : (
								<button
									className="ac-send"
									type="button"
									onClick={() => void send()}
									disabled={uploading || (!input.trim() && pending.length === 0)}
								>
									发送
								</button>
							)}
						</div>
					</div>

					<div className="ac-composer-foot">
					<div className="ac-toggles">
						<label><input type="checkbox" checked={options.thinking} onChange={(event) => setOptions((o) => ({ ...o, thinking: event.target.checked }))} />深度思考</label>
						<label><input type="checkbox" checked={tools && options.webSearch} disabled={!tools} onChange={(event) => setOptions((o) => ({ ...o, webSearch: event.target.checked }))} />联网搜索</label>
					</div>

					<ModelPicker
						providers={providers.list}
						activeId={providers.activeId}
						serverAuthed={serverAuthed}
						onSelect={activate}
					/>
					</div>
				</div>
			</section>

			{settingsOpen && (
				<Settings
					providers={providers.list}
					activeId={providers.activeId}
					serverAuthed={serverAuthed}
					options={options}
					onSaveProvider={saveProviderAndActivate}
					onDeleteProvider={deleteProvider}
					onActivate={activate}
					onSaveOptions={setOptions}
					onSignOut={() => void signOut()}
					onClose={() => setSettingsOpen(false)}
					onPush={() => void pushToServer()}
					onPull={() => void pullFromServer()}
					syncing={syncing}
					syncMessage={syncMessage}
					onImportFiles={(files) => void importFiles(files)}
					importing={importing}
					importMessage={importMessage}
				/>
			)}
		</div>
	);
}
