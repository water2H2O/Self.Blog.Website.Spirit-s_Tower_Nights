/**
 * Markdown 预处理（代码块与公式）的回归测试。
 *
 *   node tools/aichat-markdown-test.mjs
 *
 * 这里守的是一个真实事故：曾经用 `split` 切代码块，导致**所有围栏代码块
 * 在渲染时整段消失**（页面上只剩空白）。下面的用例全部围绕「代码块必须原样
 * 出现在交给 marked 的文本里」。
 */

import assert from 'node:assert/strict';

import { marked } from 'marked';

import { protectMath } from '../src/components/aichat/mdmath.ts';

// 1. 围栏代码块必须原样保留，且里面的 $ 不能被当成公式
{
	const src = ['**Python 版本**', '', '```python', 'price = 3', 'tax = price * 0.1  # $ 不是公式', '```', '', '结束'].join('\n');
	const { text, tokens } = protectMath(src);
	assert.ok(text.includes('```python'), '代码围栏必须保留');
	assert.ok(text.includes('price = 3'), '代码内容必须保留');
	assert.equal(tokens.length, 0, '代码块里的 $ 不能被抽成公式');

	const html = marked.parse(text, { gfm: true, breaks: true, async: false });
	assert.ok(html.includes('<pre><code class="language-python">'), 'marked 必须产出 pre/code');
}

// 2. 代码块之外的公式仍然要被抽出来
{
	const src = '公式 $E = mc^2$ 和 $$\\int_0^1 x^2\\,dx$$ 都在正文里。';
	const { text, tokens } = protectMath(src);
	assert.equal(tokens.length, 2, '两个公式');
	assert.ok(text.includes('@@MATH0@@') && text.includes('@@MATH1@@'));
	assert.equal(tokens[0].tex, 'E = mc^2');
	assert.equal(tokens[0].display, false);
	assert.equal(tokens[1].display, true);
}

// 3. 代码块 + 公式混排：只替换正文那一个，块内不动
{
	const src = ['正文 $a+b$', '', '```js', 'const s = `$not math$`;', '```', '', '再来 $c$'].join('\n');
	const { text, tokens } = protectMath(src);
	assert.equal(tokens.length, 2, '只有正文里的两个 $…$');
	assert.ok(text.includes('const s = `$not math$`;'), '代码块内容不能被改写');
	assert.ok(text.includes('@@MATH0@@') && text.includes('@@MATH1@@'));
}

// 4. 流式输出到一半（围栏还没闭合）：尾部当代码，不抽公式
{
	const src = ['看这段：', '', '```js', 'const a = 1;', 'const b = $x + $y;'].join('\n');
	const { text, tokens } = protectMath(src);
	assert.equal(tokens.length, 0, '未闭合围栏的尾部不抽公式');
	assert.ok(text.includes('const b = $x + $y;'), '未闭合的代码原样保留');
}

// 5. 多个代码块之间的正文仍正常处理
{
	const src = ['```a', '```', '中间 $x$', '```b', '```'].join('\n');
	const { text, tokens } = protectMath(src);
	assert.equal(tokens.length, 1);
	assert.ok(text.includes('```a') && text.includes('```b'));
}

console.log('markdown.test: 全部通过');
