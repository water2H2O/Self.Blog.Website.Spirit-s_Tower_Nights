/**
 * 设置弹窗。
 *
 * 结构照着 DSH 自己的设置来（左侧分组、右侧内容），但只保留这个页面真的有的
 * 东西：账号与余额、通用设置、模型。插件、自动化任务那些是 Harness 才有的。
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import ProviderForm from './ProviderForm.tsx';
import { providerLabel, providerSubtitle } from './request.ts';
import type { Provider } from './request.ts';
import type { ChatOptions } from './types.ts';

type Tab = 'account' | 'general' | 'model';

const TABS: { id: Tab; label: string }[] = [
	{ id: 'account', label: '账号与余额' },
	{ id: 'general', label: '通用设置' },
	{ id: 'model', label: '模型' },
];

export default function Settings({
	providers,
	activeId,
	serverAuthed,
	options,
	onSaveProvider,
	onDeleteProvider,
	onActivate,
	onSaveOptions,
	onSignOut,
	onClose,
	onPush,
	onPull,
	syncing,
	syncMessage,
}: {
	providers: Provider[];
	activeId: string | null;
	serverAuthed: boolean;
	options: ChatOptions;
	onSaveProvider: (provider: Provider) => void;
	onDeleteProvider: (id: string) => void;
	onActivate: (id: string | null) => void;
	onSaveOptions: (options: ChatOptions) => void;
	onSignOut: () => void;
	onClose: () => void;
	onPush: () => void;
	onPull: () => void;
	syncing: boolean;
	syncMessage: string;
}) {
	const [tab, setTab] = useState<Tab>('model');
	/** null 表示没在编辑；'new' 表示新增；否则是被编辑的 provider id */
	const [editing, setEditing] = useState<'new' | string | null>(null);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onClose]);

	const active = providers.find((provider) => provider.id === activeId) ?? null;
	const editingProvider = editing && editing !== 'new' ? (providers.find((provider) => provider.id === editing) ?? null) : null;

	return (
		<div
			className="ac-mask"
			role="presentation"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div className="ac-modal" role="dialog" aria-modal="true" aria-label="设置">
				<header className="ac-modal-head">
					<h2>设置</h2>
					<button className="ac-modal-x" type="button" onClick={onClose} aria-label="关闭">
						×
					</button>
				</header>

				<div className="ac-modal-body">
					<nav className="ac-modal-nav">
						{TABS.map((item) => (
							<button
								key={item.id}
								type="button"
								className={tab === item.id ? 'ac-nav-on' : ''}
								onClick={() => setTab(item.id)}
							>
								{item.label}
							</button>
						))}
					</nav>

					<section className="ac-modal-pane">
						{tab === 'account' && (
							<Pane title="账号与余额">
								<div className="ac-info">
									<span>当前接口</span>
									<strong>{active ? providerLabel(active) : '站点额度'}</strong>
								</div>
								<div className="ac-info">
									<span>API Key</span>
									<strong>{active ? providerSubtitle(active) : serverAuthed ? '服务端保管' : '未配置'}</strong>
								</div>
								<p className="ac-field-hint ac-field-hint-block">
									自己的 Key 只存在这个浏览器（localStorage），请求由浏览器直连上游，本站服务器不经手。
									余额请到对应的开放平台查询。
								</p>
								<div className="ac-row-btns">
									<button className="ac-text-btn" type="button" onClick={onSignOut}>
										退出登录
									</button>
								</div>

								<h4 className="ac-sub-title">云端快照</h4>
								<p className="ac-field-hint ac-field-hint-block">
									把本机会话整包存到服务器，换设备时再拉回来。只传文字与文件引用，不传图片原件。
									需要站点口令（自己的 API 模式没有服务端会话）。
								</p>
								<div className="ac-row-btns">
									<button className="ac-primary" type="button" onClick={onPush} disabled={!serverAuthed || syncing}>
										{syncing ? '处理中…' : '上传本机数据'}
									</button>
									<button className="ac-text-btn" type="button" onClick={onPull} disabled={!serverAuthed || syncing}>
										从服务器恢复
									</button>
								</div>
								{syncMessage && <p className="ac-field-hint ac-field-hint-block">{syncMessage}</p>}
							</Pane>
						)}

						{tab === 'general' && (
							<Pane title="通用设置">
								<p className="ac-field-hint ac-field-hint-block">新对话默认带上这些开关，每次对话里还能单独改。</p>
								{[
									{ key: 'thinking' as const, label: '深度思考', desc: '开启思考模式；联网工具会变成深度思考搜索。' },
									{ key: 'webSearch' as const, label: '联网搜索', desc: '模型按需搜索网页并在回答里给出引用。' },
									{ key: 'readUrl' as const, label: '阅读链接', desc: '自动识别消息里的链接并抓取正文。' },
									{ key: 'richLayout' as const, label: '文档识图', desc: '上传 PDF/Office 时用图文混排解析（更贵、更占 token）。' },
								].map((item) => (
									<label className="ac-check" key={item.key}>
										<input
											type="checkbox"
											checked={Boolean(options[item.key])}
											onChange={(event) => onSaveOptions({ ...options, [item.key]: event.target.checked })}
										/>
										<span>
											<strong>{item.label}</strong>
											<em>{item.desc}</em>
										</span>
									</label>
								))}
							</Pane>
						)}

						{tab === 'model' && (
							<Pane title="模型">
								<p className="ac-field-hint ac-field-hint-block">
									可以存多个 Key / 接口，对话顶栏的下拉里随时切。切换只影响之后的提问，不改历史。
								</p>
								<div className="ac-provider-list">
									{providers.length === 0 && <p className="ac-tool-empty">还没有配置任何 API</p>}
									{providers.map((provider) => (
										<div className={`ac-provider-row${provider.id === activeId ? ' ac-provider-on' : ''}`} key={provider.id}>
											<div className="ac-provider-meta">
												<strong>
													{providerLabel(provider)}
													{provider.id === activeId && <em className="ac-provider-badge">使用中</em>}
												</strong>
												<span>{providerSubtitle(provider)}</span>
											</div>
											<div className="ac-provider-ops">
												{provider.id !== activeId && (
													<button className="ac-text-btn" type="button" onClick={() => onActivate(provider.id)}>
														使用
													</button>
												)}
												<button className="ac-text-btn" type="button" onClick={() => setEditing(provider.id)}>
													编辑
												</button>
												<button className="ac-text-btn" type="button" onClick={() => onDeleteProvider(provider.id)}>
													删除
												</button>
											</div>
										</div>
									))}
									{serverAuthed && (
										<div className={`ac-provider-row${activeId === null ? ' ac-provider-on' : ''}`}>
											<div className="ac-provider-meta">
												<strong>
													站点额度
													{activeId === null && <em className="ac-provider-badge">使用中</em>}
												</strong>
												<span>走本站 Worker，Key 在服务端，不用填</span>
											</div>
											{activeId !== null && (
												<button className="ac-text-btn" type="button" onClick={() => onActivate(null)}>
													使用
												</button>
											)}
										</div>
									)}
								</div>

								{editing ? (
									<div className="ac-provider-editor">
										<ProviderForm
											initial={editingProvider}
											submitLabel={editing === 'new' ? '添加' : '保存'}
											onCancel={() => setEditing(null)}
											onSave={(provider) => {
												onSaveProvider(provider);
												setEditing(null);
											}}
										/>
									</div>
								) : (
									<button className="ac-primary ac-add-provider" type="button" onClick={() => setEditing('new')}>
										＋ 添加 API
									</button>
								)}
							</Pane>
						)}
					</section>
				</div>
			</div>
		</div>
	);
}

function Pane({ title, children }: { title: string; children: ReactNode }) {
	return (
		<>
			<h3 className="ac-pane-title">{title}</h3>
			{children}
		</>
	);
}
