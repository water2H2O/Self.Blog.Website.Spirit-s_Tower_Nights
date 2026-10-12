/**
 * 把「标签：值」连排的段落合成一张角色卡表格。
 *
 * 角色档案、种族档案、设定条目、伊甸园档案的正文常常长这样：
 *
 *     姓名：蔚蓝
 *
 *     种族：晶裔
 *
 *     身份：某个主要晶脉群系的“调谐主脑”之人形化身。
 *
 * 视觉上这就是一张角色卡，但 markdown 会把它渲染成一串普通段落，读起来散。
 * 这里在**内容加载阶段**改写正文：把连排的字段块替换成一段表格 HTML，
 * 其余字节原样保留。选择改数据而不是挂 markdown 插件，是因为 Astro 7 默认
 * 换用了 Sätteri 处理器，remark 插件要额外装包、还会影响全站渲染；
 * 而直接产出 HTML 表格任何处理器都吃，影响范围只有这四个集合。
 *
 * 安全边界：
 * - 至少 minRows 行才合并，避免误伤正文里偶然出现的一句「xx：yy」
 * - 单行、不含任何 markdown 标记才合并；值里出现链接/强调等一律跳过
 * - 剧情正文不经过这里（只挂在 characters / races / lore / eden 四个 loader 上）
 */

const FIELD = /^([^：:]{1,16})[：:][ \t]*(\S.*)$/;
/** 含这些字符说明带 markdown 标记，整块跳过 */
const MARKDOWNISH = /[*_`[\]<>|#\\]/;

const escapeHtml = (text) =>
	text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

/** 判断一个段落是不是「标签：值」；是就返回 [标签, 值] */
function asField(block) {
	const text = block.trim();
	if (!text || text.includes('\n')) return null;
	if (MARKDOWNISH.test(text)) return null;
	const match = text.match(FIELD);
	if (!match) return null;
	const label = match[1].trim();
	const value = match[2].trim();
	// 标签不能以标点/列表符号开头
	if (!label || /^[\s\-—–*+>#\d]/.test(label)) return null;
	return [label, value];
}

/**
 * 产出 markdown 原生表格：第一个字段占表头行，其余进表体。
 *
 * 为什么不让表头留空：正文里本来就有人手写的表格（设定条目、天翼种档案），
 * 空表头要靠 CSS 把 thead 藏掉，会连那些真表头一起藏。让首行充当表头就
 * 不需要任何特判，样式上再把它调成和普通行一样即可。
 *
 * 不能写裸 HTML：Astro 7 默认的 Sätteri 处理器会把正文里的 HTML 块直接丢掉，
 * 连里面的文字一起没了（试过，字段整段消失）。markdown 表格则是语法原生的。
 */
function buildTable(rows) {
	const esc = (text) => text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
	const [head, ...rest] = rows;
	const lines = [`| ${esc(head[0])} | ${esc(head[1])} |`, '| --- | --- |'];
	for (const [label, value] of rest) {
		lines.push(`| ${esc(label)} | ${esc(value)} |`);
	}
	return lines.join('\n');
}

/**
 * @param {string} body markdown 正文
 * @param {{ minRows?: number }} [options]
 * @returns {string} 改写后的正文（没命中就原样返回）
 */
export function mergeFieldTables(body, options = {}) {
	const minRows = options.minRows ?? 2;
	if (!body.includes('：') && !body.includes(':')) return body;

	// 按空行切块，但把分隔符一起留着，最后原样拼回去
	const parts = body.split(/(\n[ \t]*\n+)/);
	const isText = (index) => index % 2 === 0;

	let changed = false;
	for (let i = 0; i < parts.length; i += 1) {
		if (!isText(i)) continue;
		const first = asField(parts[i]);
		if (!first) continue;

		const rows = [first];
		let end = i;
		while (end + 2 < parts.length) {
			const next = asField(parts[end + 2]);
			if (!next) break;
			rows.push(next);
			end += 2;
		}
		if (rows.length < minRows) continue;

		parts[i] = buildTable(rows);
		// 把这一串字段块之间的分隔符一并清掉
		for (let k = i + 1; k <= end; k += 1) parts[k] = '';
		changed = true;
	}

	return changed ? parts.join('') : body;
}

/**
 * 包一层 loader：载入后改写正文里连排的字段块。
 *
 * 注意 Astro 的 loader 契约：`load(context)` 不返回 store，而是从 context 里
 * 拿到 store 并直接写进去（context 里的 store 是 collection 的 DataStore）。
 * @param {{ name: string, load: (ctx: any) => Promise<void> | void, schema?: unknown }} base
 */
export function withFieldTables(base, options = {}) {
	return {
		name: `${base.name}-field-tables`,
		schema: base.schema,
		load: async (context) => {
			await base.load(context);

			const store = context.store;
			/** 改了正文就必须重算摘要：渲染层按 digest 判断内容有没有变，不然会用旧的渲染结果 */
			const generateDigest = context.generateDigest ?? ((value) => String(value.length));
			let count = 0;
			for (const entry of store.values()) {
				if (!entry.body) continue;
				const next = mergeFieldTables(entry.body, options);
				if (next === entry.body) continue;

				/*
				 * 注意：这里必须把 rendered 键**整个去掉**，不能写成 rendered: undefined。
				 * 渲染层用 `'rendered' in entry` 判断是否需要重新渲染，留一个值为 undefined
				 * 的键会让它以为已经渲染过，结果整篇正文渲染成空白。
				 */
				const { rendered: _drop, ...rest } = entry;
				store.set({
					...rest,
					body: next,
					digest: generateDigest(next),
				});
				count += 1;
			}
			if (count > 0) {
				context.logger?.info(`[field-tables] ${context.collection}：${count} 条正文里的字段块已合成表格`);
			}
		},
	};
}
