/**
 * 友链体检：逐条请求 src/data/friends.ts 里的链接，报告能否打开；
 * 对 http:// 的条目再试一次 https，能通就提示「可以改成 https 了」。
 *
 *   node tools/check-friends.mjs
 *
 * 只读、不改文件；依赖网络，所以不放进 CI。
 */
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/data/friends.ts', import.meta.url), 'utf8');
const hrefs = [...src.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);

async function probe(url) {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), 10000);
	try {
		const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': 'water2h2o-friend-check' } });
		return { ok: res.ok, status: res.status, final: res.url };
	} catch (err) {
		return { ok: false, status: 0, error: err.cause?.code || err.name };
	} finally {
		clearTimeout(timer);
	}
}

let bad = 0;
let tls = 0;
for (const href of hrefs) {
	const r = await probe(href);
	const tlsErr = !r.ok && /CERT|SSL|TLS/.test(r.error || '');
	let line = `${r.ok ? 'OK  ' : tlsErr ? 'TLS ' : 'FAIL'} ${r.status || r.error}  ${href}`;
	if (tlsErr) tls++;
	else if (!r.ok) bad++;
	if (href.startsWith('http://')) {
		const s = await probe(href.replace(/^http:/, 'https:'));
		line += s.ok ? '  → https 已可用，可以把 href 改成 https' : `  （https 仍不可用：${s.status || s.error}）`;
	}
	console.log(line);
}
console.log(`\n${hrefs.length} 条：${bad} 条打不开，${tls} 条证书校验失败`);
if (tls) console.log('证书失败先排除本机网络：公司/校园防火墙做 TLS 解密时会换掉证书（签发者如 pan-fw-trust），换网络再测。');
