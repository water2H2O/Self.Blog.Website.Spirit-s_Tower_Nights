/**
 * 随笔的短码。
 *
 * URL 里用它（`/blog/k3m9d2/`），`src/content/blog/` 下的文件名继续保留可读的名字 ——
 * 两者用小写 base36 的 6 位码对上：稳定、无依赖、同一个文件名永远算出同一个码。
 *
 * 为什么不用文件名当 slug：文件名是给人看的（`a-fish-rearranges-the-about-page`），
 * 二十多字贴在地址栏里又长又难抄；短码短、稳定，改标题也不影响链接。
 */

/** FNV-1a（32 位）：够散、几行代码、不用引包 */
function fnv1a(text: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash >>> 0;
}

/** 单个文件的码（6 位 base36，撞码由下面的 blogCodes 兜底） */
export function blogCode(id: string): string {
	return fnv1a(id).toString(36).padStart(6, '0').slice(-6);
}

/**
 * 一批随笔的「文件名 → 短码」表；万一两个文件撞码，第二个往后顺延一位。
 * 页面、列表、RSS 都走这一份，保证三处永远一致。
 */
export function blogCodes(ids: string[]): Map<string, string> {
	const used = new Set<string>();
	const out = new Map<string, string>();
	for (const id of [...ids].sort()) {
		let code = blogCode(id);
		let salt = 1;
		while (used.has(code)) {
			code = blogCode(id).slice(0, 5) + (salt % 36).toString(36);
			salt += 1;
		}
		used.add(code);
		out.set(id, code);
	}
	return out;
}
