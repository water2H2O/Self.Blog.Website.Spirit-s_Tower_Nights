// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	// 部署到 GitHub Pages 后的地址；换自定义域名时改这里。
	site: 'https://water2h2o.github.io/Self.Blog.Website.Spirit-s_Tower_Nights/',
	integrations: [mdx(), sitemap()],
	vite: {
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
