/**
 * Markdown 里的公式保护。
 *
 * 为什么要单独一个文件：这里出过一次「代码块整段消失」的事故 ——
 * 用 `source.split(/```[\s\S]*?```/g)` 想按「文本 / 代码 / 文本」切开，
 * 但 `split` 返回的是**匹配之间的内容**，被匹配到的代码块不会出现在结果里，
 * 拼回去时整段代码就没了（页面上表现为「闪一下代码框然后消失」）。
 *
 * 现在改成用 exec 逐段拼接，代码块原样保留；顺便把「流式期间还没有闭合围栏」
 * 的尾部也当代码看，避免公式替换去动正在生成的代码。
 */

export type MathToken = { tex: string; display: boolean };

const FENCE = /```[\s\S]*?```/g;
// $$…$$、\[…\]、\(…\)、$…$（行内，前后不能是空白）
const MATH = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?!\s)([^$\n]+?)(?<!\s)\$/g;

function replaceMath(text: string, tokens: MathToken[]): string {
	return text.replace(MATH, (_match, block, bracketBlock, paren, inline) => {
		const tex = block ?? bracketBlock ?? paren ?? inline ?? '';
		const display = Boolean(block ?? bracketBlock);
		const index = tokens.push({ tex: String(tex).trim(), display }) - 1;
		return `@@MATH${index}@@`;
	});
}

/**
 * 把公式抽成占位符，返回可以直接交给 marked 的文本。
 * 代码块（``` 围起来的部分，以及流式期间尚未闭合的尾部）不会被替换。
 */
export function protectMath(source: string): { text: string; tokens: MathToken[] } {
	const tokens: MathToken[] = [];
	let out = '';
	let last = 0;

	FENCE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = FENCE.exec(source)) !== null) {
		out += replaceMath(source.slice(last, match.index), tokens);
		out += match[0]; // 代码块原样保留
		last = match.index + match[0].length;
	}

	const tail = source.slice(last);
	const openFence = tail.indexOf('```');
	if (openFence >= 0) {
		// 流式输出到一半：闭合围栏还没来，后半段当代码处理
		out += replaceMath(tail.slice(0, openFence), tokens);
		out += tail.slice(openFence);
	} else {
		out += replaceMath(tail, tokens);
	}

	return { text: out, tokens };
}

/**
 * 修掉「表格被空行劈开」。
 *
 * 模型有时会在表格行之间插空行（尤其是边搜边写的时候），而 GFM 规定空行
 * 结束表格 —— 结果就是表头单独成表、后面的行全变成带竖线的段落。
 * 这里只在「上一行和下一行都是表格行」时丢掉中间的空行，不碰其它内容。
 */
export function normalizeTables(source: string): string {
	const lines = source.split('\n');
	const out: string[] = [];
	let inFence = false;
	const isRow = (line: string | undefined) => Boolean(line && /^\s*\|.*\|\s*$/.test(line));

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		if (/^\s*```/.test(line)) inFence = !inFence;

		if (!inFence && line.trim() === '') {
			let j = i + 1;
			while (j < lines.length && lines[j].trim() === '') j += 1;
			if (isRow(out[out.length - 1]) && isRow(lines[j])) continue;
		}
		out.push(line);
	}
	return out.join('\n');
}