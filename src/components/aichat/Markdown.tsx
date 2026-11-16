/**
 * Markdown 渲染：marked 解析 → DOMPurify 消毒 → KaTeX 公式 → 代码块增强 → Mermaid。
 *
 * 几个关键点：
 *   1. 公式先被抽成占位符，等 sanitize 之后再换回 KaTeX 的 HTML。
 *      这样 DOMPurify 不必放行 KaTeX 那一大堆 span/style，消毒面更小。
 *   2. 抽公式的范围由 mdmath.ts 负责：只在代码块之外替换。
 *      （曾经用 split 切代码块，结果整段代码被吞掉，详见那个文件的注释。）
 *   3. 代码块在消毒之后**用 DOM 加壳**：语言标签 + 复制按钮。
 *      不放进 HTML 字符串里，是因为 DOMPurify 会把这些标签当不可信内容处理。
 *   4. 语法高亮是动态 import + 120ms 防抖：流式输出时每 80ms 重渲染一次，
 *      不防抖会把主线程按住反复高亮同一段越来越长的代码。
 *
 * 组件在挂载后才渲染 HTML：SSR 阶段给纯文本，避免 hydration 不一致，
 * 也避免 DOMPurify / mermaid 在 Node 里被调用。
 */

import DOMPurify from 'dompurify';
import katex from 'katex';
import { marked } from 'marked';
import { useEffect, useMemo, useRef, useState } from 'react';

import { normalizeTables, protectMath } from './mdmath.ts';
import type { MathToken } from './mdmath.ts';

function renderMath(html: string, tokens: MathToken[]): string {
	return html.replace(/@@MATH(\d+)@@/g, (match, index) => {
		const token = tokens[Number(index)];
		if (!token) return match;
		try {
			return katex.renderToString(token.tex, {
				displayMode: token.display,
				throwOnError: false,
				output: 'html',
			});
		} catch {
			return match;
		}
	});
}

export function renderMarkdown(source: string): string {
	const { text, tokens } = protectMath(normalizeTables(source));
	const raw = marked.parse(text, { gfm: true, breaks: true, async: false }) as string;
	const clean = DOMPurify.sanitize(raw, { ADD_ATTR: ['target', 'rel'] });
	return renderMath(clean, tokens);
}

/** 给代码块加「语言 + 复制」的外壳。已加过壳的跳过，避免重复包裹。 */
function decorateCodeBlocks(root: HTMLElement) {
	root.querySelectorAll<HTMLElement>('pre').forEach((pre) => {
		if (pre.closest('.ac-code')) return;
		const code = pre.querySelector('code');
		// mermaid 的块要留给后面换成图，不加代码壳
		if (!code || code.classList.contains('language-mermaid')) return;

		const language = (code.className.match(/language-([\w+#.-]+)/)?.[1] ?? 'text').toLowerCase();

		const wrap = document.createElement('div');
		wrap.className = 'ac-code';

		const head = document.createElement('div');
		head.className = 'ac-code-head';

		const label = document.createElement('span');
		label.className = 'ac-code-lang';
		label.textContent = language;

		const copy = document.createElement('button');
		copy.type = 'button';
		copy.className = 'ac-code-copy';
		copy.textContent = '复制';
		copy.addEventListener('click', () => {
			const text = code.textContent ?? '';
			const done = (labelText: string) => {
				copy.textContent = labelText;
				window.setTimeout(() => {
					copy.textContent = '复制';
				}, 1500);
			};
			if (!navigator.clipboard) {
				done('不支持');
				return;
			}
			navigator.clipboard.writeText(text).then(
				() => done('已复制'),
				() => done('复制失败'),
			);
		});

		head.append(label, copy);
		pre.parentNode?.insertBefore(wrap, pre);
		wrap.append(head, pre);
	});
}

export default function Markdown({ text }: { text: string }) {
	const [mounted, setMounted] = useState(false);
	const ref = useRef<HTMLDivElement | null>(null);

	useEffect(() => setMounted(true), []);

	const html = useMemo(() => (mounted ? renderMarkdown(text) : ''), [mounted, text]);

	useEffect(() => {
		const root = ref.current;
		if (!root) return;

		// 外链一律新窗口打开，别把聊天页顶掉
		root.querySelectorAll('a[href]').forEach((anchor) => {
			anchor.setAttribute('target', '_blank');
			anchor.setAttribute('rel', 'noreferrer noopener');
		});

		decorateCodeBlocks(root);

		// 语法高亮：动态加载 + 防抖
		const codeNodes = Array.from(root.querySelectorAll<HTMLElement>('pre code')).filter(
			(node) => !node.classList.contains('language-mermaid'),
		);
		let cancelled = false;
		const timer = window.setTimeout(async () => {
			if (cancelled || codeNodes.length === 0) return;
			try {
				const { default: hljs } = await import('highlight.js/lib/common');
				if (cancelled) return;
				for (const node of codeNodes) {
					if (!node.isConnected || node.dataset.highlighted === 'yes') continue;
					// 没有语言标记就不猜，交给 hljs 自动检测太慢且常常猜错
					if (!/language-/.test(node.className)) continue;
					try {
						hljs.highlightElement(node);
					} catch {
						/* 未知语言：保持纯文本 */
					}
				}
			} catch {
				/* highlight.js 没加载成功：代码仍然是可读的纯文本 */
			}
		}, 120);

		// Mermaid：把对应代码块换成图
		const mermaidNodes = Array.from(root.querySelectorAll<HTMLElement>('pre > code.language-mermaid'));
		let mermaidCancelled = false;
		if (mermaidNodes.length > 0) {
			(async () => {
				try {
					const mermaid = (await import('mermaid')).default;
					mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });
					for (const [index, code] of mermaidNodes.entries()) {
						if (mermaidCancelled) return;
						const source = code.textContent ?? '';
						try {
							const { svg } = await mermaid.render(`ac-mermaid-${index}-${Date.now()}`, source);
							const host = document.createElement('div');
							host.className = 'ac-mermaid';
							host.innerHTML = svg;
							code.parentElement?.replaceWith(host);
						} catch {
							// 画不出来就留在代码块形态，不打断整条回答
						}
					}
				} catch {
					/* mermaid 没加载成功：保持代码块 */
				}
			})();
		}

		return () => {
			cancelled = true;
			mermaidCancelled = true;
			window.clearTimeout(timer);
		};
	}, [html]);

	if (!mounted) return <div className="ac-text">{text}</div>;
	return <div className="ac-md" ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}
