/**
 * 站点唯一的 Worker 脚本。
 *
 * 除了一条路径，其余全部原样交给静态资源（先匹配 dist/ 里的文件，找不到再走 404.html）。
 * 唯一特殊的是 /teapot：返回 HTTP 418 —— RFC 2324 那个茶壶状态码，
 * 顺便对上《晶体网络协议》§6.3 里 MAP 的 418 STOP AND HAVE A CUP OF WEILAN。
 *
 * 为什么要 Worker：静态托管只能返 200/404，状态码是服务端才能给的。
 * 部署配置见 wrangler.jsonc 的 main 与 assets.binding。
 */

const TEAPOT_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>418 · 来一杯蔚蓝吗</title>
<meta name="robots" content="noindex" />
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 2em 1.2em;
    background:
      radial-gradient(120% 80% at 50% -10%, rgba(127, 233, 240, 12%), transparent 62%),
      linear-gradient(180deg, #0b1a26, #08121a 70%);
    color: #dee8f2;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
    overflow-x: hidden;
  }
  /* 晶格：几道极淡的斜线，暗示这是晶脉网络而不是普通网页 */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(60deg, rgba(175, 255, 255, 4%) 1px, transparent 1px),
      linear-gradient(-60deg, rgba(175, 255, 255, 4%) 1px, transparent 1px);
    background-size: 110px 190px, 110px 190px;
    mask-image: radial-gradient(90% 70% at 50% 40%, #000 20%, transparent 78%);
  }
  main {
    position: relative;
    width: min(34em, 100%);
    text-align: center;
  }
  .art { width: 190px; margin: 0 auto 0.4em; display: block; filter: drop-shadow(0 0 22px rgba(127, 233, 240, 30%)); }
  .code {
    margin: 0.2em 0 0;
    font: 600 3.6em/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.08em;
    color: #afffff;
    text-shadow: 0 0 28px rgba(175, 255, 255, 42%);
  }
  .name {
    margin: 0.35em 0 0;
    font: 500 0.78em/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.16em;
    color: #7fe9f0;
    text-transform: uppercase;
  }
  .say {
    margin: 1.5em 0 0;
    font-size: 1.12em;
    line-height: 1.95;
    color: #dee8f2;
  }
  .say strong { color: #afffff; font-weight: 600; }
  .meta {
    margin: 1.6em 0 0;
    font: 0.74em/1.9 ui-monospace, SFMono-Regular, Menlo, monospace;
    color: #7e93a5;
  }
  .meta code { color: #9fb6c7; overflow-wrap: anywhere; }
  .technical { margin: 1.5em auto 0; max-width: 32em; text-align: left; }
  .technical summary { cursor: pointer; text-align: center; color: #9fb6c7; padding: 0.5em; }
  .technical[open] { padding: 0.8em 1em; border: 1px solid rgba(175,255,255,16%); border-radius: 12px; }
  .technical p { margin: 0.8em 0 0; }
  .technical pre { overflow-x: auto; padding: 0.8em; background: #08121a; border-radius: 8px; font-size: 0.95em; }
  a:focus-visible, summary:focus-visible { outline: 2px solid #afffff; outline-offset: 4px; }
  a {
    display: inline-block;
    margin-top: 2em;
    padding: 0.62em 1.35em;
    border-radius: 999px;
    border: 1px solid rgba(175, 255, 255, 26%);
    color: #afffff;
    text-decoration: none;
    font-size: 0.86em;
    letter-spacing: 0.08em;
    transition: border-color 0.16s ease, background 0.16s ease;
  }
  a:hover { border-color: rgba(175, 255, 255, 55%); background: rgba(175, 255, 255, 7%); }
  @media (max-width: 480px) {
    .code { font-size: 2.9em; }
    .art { width: 150px; }
  }
</style>
</head>
<body>
<main>
  <!-- 一杯茶，边上浮着一块晶体：蔚蓝本人不来，派了个信物 -->
  <svg class="art" viewBox="0 0 190 130" role="img" aria-label="一只茶壶正往杯子里倒茶，旁边浮着一块晶体">
    <g fill="none" stroke="#7fe9f0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M52 62h58v22a24 24 0 0 1-24 24H76a24 24 0 0 1-24-24z" fill="rgba(127,233,240,10%)"/>
      <path d="M110 68c14-2 22 6 22 15s-8 17-22 15"/>
      <path d="M52 72c-16-2-22 4-22 10"/>
      <path d="M64 56V46m18 10V42m18 14V48"/>
      <path d="M30 108h104" stroke-opacity=".5"/>
    </g>
    <g fill="none" stroke="#afffff" stroke-width="2" stroke-linejoin="round">
      <path d="M150 30l16 9v20l-16 9-16-9V39z" fill="rgba(175,255,255,12%)"/>
      <path d="M134 39l16 9 16-9M150 48v20" stroke-opacity=".55"/>
    </g>
    <g fill="#7fe9f0" fill-opacity=".55">
      <circle cx="86" cy="26" r="2.6"/><circle cx="100" cy="18" r="1.8"/><circle cx="74" cy="18" r="1.6"/>
    </g>
  </svg>

  <p class="code">418</p>
  <p class="name">I'm a teapot · STOP AND HAVE A CUP OF WEILAN</p>

  <p class="say">
    处理啥的太麻烦啦，<strong>你要先来一杯蔚蓝吗？</strong>
  </p>

  <p class="meta">先歇一会儿，水塔还在这里。</p>

  <details class="meta technical">
    <summary>给懂行的：RFC 2324 合规声明</summary>
    <p>这里真的返回 HTTP 418 I'm a teapot，响应头里还有 <code>x-teapot: true</code>。</p>
    <pre><code>curl -I https://water2h2o.com/teapot</code></pre>
    <p>茶壶梗来自 RFC 2324；蔚蓝版的状态码来自伊甸园的晶体网络协议：SVC 应用层 · 记忆存取协议（MAP）中的 <code>418 STOP AND HAVE A CUP OF WEILAN</code>。</p>
  </details>

  <a href="/">← 回水塔</a>
</main>
</body>
</html>
`;

export default {
	async fetch(request, env) {
		const { pathname } = new URL(request.url);

		if (pathname === '/teapot' || pathname === '/teapot/') {
			const head = request.method === 'HEAD';
			return new Response(head ? null : TEAPOT_HTML, {
				status: 418,
				headers: {
					'content-type': 'text/html; charset=utf-8',
					'x-teapot': 'true',
					'cache-control': 'public, max-age=3600',
				},
			});
		}

		const response = await env.ASSETS.fetch(request);

		// 静态资源优先：走到这里说明没命中任何文件。HTML 请求依旧交给 404.html，
		// 这样 Worker 上线前后，找不到的路径长得一模一样（图片之类的仍保持纯 404）。
		const wantsHtml = (request.headers.get('accept') ?? '').includes('text/html');
		if (response.status === 404 && wantsHtml && (request.method === 'GET' || request.method === 'HEAD')) {
			const fallback = await env.ASSETS.fetch(new URL('/404.html', request.url));
			if (fallback.ok) {
				return new Response(request.method === 'HEAD' ? null : fallback.body, {
					status: 404,
					headers: { 'content-type': 'text/html; charset=utf-8' },
				});
			}
		}

		return response;
	},
};
