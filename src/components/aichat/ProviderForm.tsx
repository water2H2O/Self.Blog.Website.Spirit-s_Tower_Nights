/**
 * 「添加 / 编辑一个 API」的表单：官方 Key 一行搞定，自定义接口多几个字段。
 *
 * 入口页和设置弹窗共用这一个组件，避免两处的校验规则慢慢长歪。
 */

import { useState } from 'react';

import { newProviderId, loadProviderState } from './request.ts';
import VaultUnlock from './VaultUnlock.tsx';
import { configureVault, hasVault } from './vault.ts';
import type { Provider, Protocol } from './request.ts';

type Tab = 'official' | 'custom';

export default function ProviderForm({
	initial,
	onSave,
	onCancel,
	submitLabel = '保存',
}: {
	initial: Provider | null;
	onSave: (provider: Provider) => void;
	onCancel?: () => void;
	submitLabel?: string;
}) {
	const [tab, setTab] = useState<Tab>(initial?.kind === 'custom' ? 'custom' : 'official');
	const [officialKey, setOfficialKey] = useState(initial?.kind === 'deepseek' ? initial.apiKey : '');
	const [customKey, setCustomKey] = useState(initial?.kind === 'custom' ? initial.apiKey : '');
	const [label, setLabel] = useState(initial?.label ?? '');
	const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '');
	const [protocol, setProtocol] = useState<Protocol>(initial?.protocol ?? 'openai');
	const [model, setModel] = useState(initial?.model ?? '');

	const canSave =
		tab === 'official'
			? officialKey.trim().length > 8
			: customKey.trim().length > 0 && baseUrl.trim().length > 0 && model.trim().length > 0;

	const [remember, setRemember] = useState(false);
	const [vaultPassword, setVaultPassword] = useState('');
	const [error, setError] = useState('');
	const submit = async () => {
		if (!canSave) return;
		try { await configureVault(remember, vaultPassword); }
		catch (e) { setError(String((e as Error).message)); return; }
		const id = initial?.id ?? newProviderId();
		if (tab === 'official') {
			onSave({
				id,
				kind: 'deepseek',
				label: label.trim() || '官方 API',
				apiKey: officialKey.trim(),
			});
			return;
		}
		onSave({
			id,
			kind: 'custom',
			label: label.trim() || model.trim(),
			apiKey: customKey.trim(),
			baseUrl: baseUrl.trim(),
			protocol,
			model: model.trim(),
		});
	};

	return (
		<div className="ac-provider">
			<VaultUnlock onUnlock={() => { const saved = loadProviderState(); for (const p of saved.list) onSave(p); }} />
			<div className="ac-seg" role="tablist">
				<button
					type="button"
					role="tab"
					aria-selected={tab === 'official'}
					className={tab === 'official' ? 'ac-seg-on' : ''}
					onClick={() => setTab('official')}
				>
					官方 API
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={tab === 'custom'}
					className={tab === 'custom' ? 'ac-seg-on' : ''}
					onClick={() => setTab('custom')}
				>
					自定义 API
				</button>
			</div>

			<label className="ac-field">
				<span className="ac-field-label">
					显示名称 <em>选填，用在下拉里</em>
				</span>
				<input
					type="text"
					value={label}
					onChange={(event) => setLabel(event.target.value)}
					placeholder={tab === 'official' ? '官方 API' : '例如：某某中转站'}
				/>
			</label>

			{tab === 'official' ? (
				<label className="ac-field">
					<span className="ac-field-label">API Key</span>
					<input
						type="password"
						value={officialKey}
						onChange={(event) => setOfficialKey(event.target.value)}
						placeholder="sk-…"
						autoComplete="off"
						spellCheck={false}
					/>
					<span className="ac-field-hint">在 platform.deepseek.com 的「API keys」里创建。</span>
				</label>
			) : (
				<>
					<label className="ac-field">
						<span className="ac-field-label">API 地址</span>
						<input
							type="url"
							value={baseUrl}
							onChange={(event) => setBaseUrl(event.target.value)}
							placeholder="https://api.example.com 或 https://api.example.com/v1"
							spellCheck={false}
						/>
						<span className="ac-field-hint">带不带 /v1 都行，会自动补全到具体端点。</span>
					</label>

					<label className="ac-field">
						<span className="ac-field-label">API 协议</span>
						<select value={protocol} onChange={(event) => setProtocol(event.target.value as Protocol)}>
							<option value="openai">OpenAI Chat Completions</option>
							<option value="anthropic">Anthropic Messages</option>
						</select>
					</label>

					<label className="ac-field">
						<span className="ac-field-label">模型 ID</span>
						<input
							type="text"
							value={model}
							onChange={(event) => setModel(event.target.value)}
							placeholder="例如 deepseek-chat"
							spellCheck={false}
						/>
					</label>

					<label className="ac-field">
						<span className="ac-field-label">API Key</span>
						<input
							type="password"
							value={customKey}
							onChange={(event) => setCustomKey(event.target.value)}
							placeholder="sk-…"
							autoComplete="off"
							spellCheck={false}
						/>
					</label>

					<p className="ac-field-hint ac-field-hint-block">
						自定义接口不保证支持联网搜索、读链接、文件上传与用量计费，这些入口会自动关掉。
					</p>
				</>
			)}

			<label className="ac-check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /><span>保持登录（口令加密保存 API 配置）</span></label>
			{remember && <>
				<p className="ac-error" role="alert">警告：配置会保存在此设备。不要在共享电脑勾选；解锁后仍无法防止恶意脚本或扩展读取 Key。忘记口令无法找回。</p>
				<label className="ac-field"><span>本地加密口令（至少 12 个字符，下次打开需要解锁）</span><input type="password" autoComplete="new-password" value={vaultPassword} onChange={(e) => setVaultPassword(e.target.value)} /></label>
			</>}
			{error && <p className="ac-error" role="alert">{error}</p>}
			<div className="ac-row-btns">
				<button className="ac-primary" type="button" onClick={submit} disabled={!canSave}>
					{submitLabel}
				</button>
				{onCancel && (
					<button className="ac-text-btn" type="button" onClick={onCancel}>
						取消
					</button>
				)}
			</div>
		</div>
	);
}
