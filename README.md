# Spirit's Tower Nights

个人博客站点，基于 [Astro](https://astro.build/) 7 官方 blog 模板搭建。

## 快速开始

```sh
dev.cmd install     # 安装依赖
dev.cmd dev         # 启动开发服务器 → http://localhost:4321
dev.cmd build       # 构建静态站点到 dist\
dev.cmd preview     # 预览构建结果
```

`dev.cmd` 会自动把 DSH 内置的 Node/pnpm 运行时接进来（PATH 里没有 node），并把 pnpm 的缓存、
状态目录与 store 都放在工作区内的 `..\.dsh-cache`。若在已全局安装 Node 的普通机器上，
直接用 `pnpm install` / `pnpm dev` 即可，不需要该脚本。

## 写文章

在 `src/content/blog/` 下新增 `.md`（或 `.mdx`）文件，头部 frontmatter：

```md
---
title: 文章标题
description: 一句话摘要
pubDate: 2026-10-09
heroImage: ./cover.jpg   # 可选
---
```

站点标题/描述在 `src/consts.ts`，站点地址（影响 RSS 与 sitemap 的绝对链接）在
`astro.config.mjs` 的 `site` 字段。

## 目录结构

```
src/
├── components/        Header / Footer / BaseHead 等组件
├── content/blog/      博客文章（Markdown / MDX）
├── layouts/           BlogPost 布局
├── pages/             路由：首页、about、blog 列表与详情、rss.xml
├── styles/global.css  全局样式
└── consts.ts          站点标题与描述
public/                favicon 等静态资源
```

## 当前环境下的必要配置

本项目在 DSH 沙箱里跑通，有几处是为沙箱限制而做的设置，换到普通机器也兼容：

| 配置 | 原因 |
| --- | --- |
| `pnpm-workspace.yaml` 的 `nodeLinker: hoisted` | 沙箱会把符号链接/junction 呈现成普通目录，pnpm 默认的 isolated 布局会导致依赖解析失败，改用扁平布局 |
| `astro.config.mjs` 的 `vite.resolve.preserveSymlinks: true` | Vite 在 Windows 上会执行 `net use` 来挑选 realpath 实现，沙箱禁止带管道的子进程（spawn EPERM），异常被静默吞掉后所有依赖解析返回空 → 依赖被内联成 ESM，纯 CommonJS 包报 `require is not defined` |
| `ASTRO_TELEMETRY_DISABLED=1`（见 `dev.cmd`） | Astro 遥测要写 `%APPDATA%\astro`，沙箱外不可写 |

## 部署到 GitHub Pages

仓库已连好远端 `git@github.com:water2H2O/Self.Blog.Website.Spirit-s_Tower_Nights.git`。
尚未配置自动部署；需要时在仓库 Settings → Pages 选择 GitHub Actions，并添加官方
`withastro/action` 工作流即可。若使用自定义域名，记得同步修改 `astro.config.mjs` 的 `site`。

## 许可

模板来自 [withastro/astro](https://github.com/withastro/astro)（MIT）。
