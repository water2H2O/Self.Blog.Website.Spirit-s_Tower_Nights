// @ts-check

import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';
import searchPages from './tools/search-pages-integration.mjs';
import { blogRedirects } from './tools/blog-redirects.mjs';

// https://astro.build/config
export default defineConfig({
	/**
	 * 站点正式地址。canonical、sitemap、RSS 都用它拼绝对链接，换域名只改这里。
	 *
	 * 现在挂在自定义域名的根目录下，所以**不需要** `base`；如果哪天退回
	 * GitHub Pages 的子路径部署（…github.io/<仓库名>/），再补上 `base`。
	 */
	site: 'https://water2h2o.com',
	// 与 Cloudflare 共用旧地址表：静态预览也能沿旧链接到达新地址和原章节。
	redirects: blogRedirects,
	// searchPages 在构建结束时把首页、关于、列表页等独立页面补进 search-index.json
	integrations: [mdx(), react(), sitemap(), searchPages()],
	vite: {
		// 开发时 /aichat 的接口要打到本地 Worker 模拟器（tools/aichat-dev-server.mjs，:8787）。
		// `astro dev` 本身不跑 Worker，没有这条代理，页面上所有请求都会 404。
		server: {
			proxy: {
				'/api/aichat': 'http://127.0.0.1:8787',
			},
		},
		optimizeDeps: {
			// 必须显式预打包：@astrojs/react 的 renderer 入口在 dev 里是裸文件，它内部
			// `import { createRoot, hydrateRoot } from "react-dom/client"` 不会被扫描进
			// 依赖图，浏览器于是直接拿到 CJS 版 client.js —— 报
			// "does not provide an export named 'createRoot'"，island 水合直接失败。
			include: ['react-dom/client'],
		},
		resolve: {
			// Vite 在 Windows 上会调用 `exec("net use")` 来挑选 realpath 实现。
			// 在 DSH 沙箱里带管道的子进程会被拒绝（spawn EPERM），该异常被 Vite
			// 静默吞掉，导致 node_modules 里的包一律解析失败 → 依赖全被内联成 ESM，
			// 纯 CommonJS 的包就报 "require is not defined"（astro sync 阶段）。
			// 跳过 realpath 解析即可绕开；本项目 node_modules 是扁平（hoisted）布局，
			// 不含符号链接，开启该选项没有副作用。
			preserveSymlinks: true,
		},
	},
	fonts: [
		{
			provider: fontProviders.local(),
			name: 'Atkinson',
			cssVariable: '--font-atkinson',
			fallbacks: ['sans-serif'],
			options: {
				variants: [
					{
						src: ['./src/assets/fonts/atkinson-regular.woff'],
						weight: 400,
						style: 'normal',
						display: 'swap',
					},
					{
						src: ['./src/assets/fonts/atkinson-bold.woff'],
						weight: 700,
						style: 'normal',
						display: 'swap',
					},
				],
			},
		},
	],
});
