/**
 * 输入框右下角的模型选择器（模仿 DSH 那个胶囊 + 上拉抽屉）。
 *
 * 只做选择，不负责存储：选中后回调 id（null 表示「站点额度」），
 * 具体存哪由 Chat 的 provider state 决定。
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { providerLabel, providerSubtitle } from './request.ts';
import type { Provider } from './request.ts';

const SERVER_VALUE = '__server';

export default function ModelPicker({
	providers,
	activeId,
	serverAuthed,
	onSelect,
}: {
	providers: Provider[];
	activeId: string | null;
	serverAuthed: boolean;
	onSelect: (id: string | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const searchRef = useRef<HTMLInputElement | null>(null);

	const active = providers.find((provider) => provider.id === activeId) ?? null;
	const label = active ? providerLabel(active) : '站点额度';

	const items = useMemo(() => {
		const list = providers.map((provider) => ({
			value: provider.id as string | null,
			label: providerLabel(provider),
			sub: providerSubtitle(provider),
		}));
		if (serverAuthed) list.push({ value: null, label: '站点额度', sub: '走本站 Worker，Key 在服务端' });
		const keyword = query.trim().toLowerCase();
		if (!keyword) return list;
		return list.filter((item) => `${item.label} ${item.sub}`.toLowerCase().includes(keyword));
	}, [providers, serverAuthed, query]);

	// 点外面 / Esc 关闭
	useEffect(() => {
		if (!open) return;
		const onDown = (event: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(false);
		};
		document.addEventListener('mousedown', onDown);
		document.addEventListener('keydown', onKey);
		searchRef.current?.focus();
		return () => {
			document.removeEventListener('mousedown', onDown);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);

	const choose = (value: string | null) => {
		onSelect(value);
		setOpen(false);
		setQuery('');
	};

	return (
		<div className="ac-picker" ref={wrapRef}>
			{open && (
				<div className="ac-picker-pop" role="dialog" aria-label="选择模型">
					<input
						ref={searchRef}
						className="ac-picker-search"
						type="search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="搜索模型…"
						spellCheck={false}
					/>
					<div className="ac-picker-list">
						{items.length === 0 && <p className="ac-picker-empty">没有匹配的模型</p>}
						{items.map((item) => {
							const on = (item.value ?? SERVER_VALUE) === (activeId ?? SERVER_VALUE);
							return (
								<button
									key={item.value ?? SERVER_VALUE}
									type="button"
									className={`ac-picker-item${on ? ' ac-picker-item-on' : ''}`}
									onClick={() => choose(item.value)}
								>
									<span>{item.label}</span>
									<em>{item.sub}</em>
								</button>
							);
						})}
					</div>
				</div>
			)}

			<button
				type="button"
				className="ac-picker-btn"
				onClick={() => setOpen((value) => !value)}
				title="切换模型（只影响之后的提问）"
				aria-expanded={open}
			>
				<span className="ac-picker-label">{label}</span>
				<span className="ac-picker-caret" aria-hidden="true">
					⌃
				</span>
			</button>
		</div>
	);
}
