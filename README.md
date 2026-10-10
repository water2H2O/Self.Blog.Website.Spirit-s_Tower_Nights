# Spirit's Tower Nights

一个原创 OC 世界观的站点：**设定集 + 角色档案 + 随笔**，基于 [Astro](https://astro.build/) 构建。
画库与音乐页尚未开始（见文末「还没做的房间」）。

## 快速开始

```sh
dev.cmd install     # 安装依赖
dev.cmd dev         # 启动开发服务器 → http://localhost:4321
dev.cmd build       # 构建静态站点到 dist\
dev.cmd preview     # 预览构建结果
```

`dev.cmd` 会自动把 DSH 内置的 Node/pnpm 运行时接进来（PATH 里没有 node），并把 pnpm 的缓存、
状态目录与 store 都放在工作区内的 `..\.dsh-cache`。若机器上已装好 Node，直接
`pnpm install` / `pnpm dev` 即可，不需要该脚本。

---

## 内容怎么写

站内有 **三个集合**，各管一类内容，互不干扰：

| 集合 | 目录 | 用途 | 访问地址 |
| --- | --- | --- | --- |
| `characters` | `src/content/characters/` | 角色档案 | `/characters/文件名/` |
| `lore` | `src/content/lore/` | 世界观设定条目 | `/world/文件名/` |
| `blog` | `src/content/blog/` | 随笔 / 制作花絮 | `/blog/文件名/` |

新增内容 = 在对应目录下新建一个 `.md` 文件，文件名就是网址的最后一段。
（例如 `src/content/characters/aling.md` → `/characters/aling/`）

### 角色档案

```md
---
name: 守塔人 · 阿绫      # 必填，显示名
summary: 一句话简介       # 必填，列表卡片和 SEO 都用它
aliases: ['阿绫', '点灯的人']
role: 主角                # 定位：主角 / 配角 / 反派……
affiliation: 守塔人       # 所属势力
pronouns: 她
age: '19'                # 字符串，可以写「不详」
themeColor: '#7c5cff'    # 主题色，决定卡片和详情页的配色
portrait: '../../assets/aling.jpg'   # 立绘，不填会显示名字首字色块
tags: ['守塔人', '火']
lore: ['tower', 'starlight']         # 关联设定，写文件名（不含 .md）
spoiler: none            # none / mild / heavy
draft: false             # true 则不显示、不生成页面
order: 10                # 越小越靠前
---

正文用普通 markdown 写，想看结构可参考 `example-aling.md`。
```

### 设定条目

```md
---
title: 永夜塔
summary: 一句话说明这条设定是什么
category: 地理           # 地理 / 种族 / 体系 / 组织 / 历史 / 器物 / 概念
cover: '../../assets/tower.jpg'      # 可选，卡片顶部配图
themeColor: '#0ea5e9'
tags: ['核心地点']
characters: ['aling']    # 关联角色
related: ['starlight']   # 关联的其他设定
spoiler: none
draft: false
order: 10
---
```

### 随笔

```md
---
title: 文章标题
description: 一句话摘要
pubDate: 2026-10-10
heroImage: '../../assets/cover.jpg'  # 可选
draft: false
---
```

### 交叉引用是这套骨架的重点

`lore:` / `characters:` / `related:` 里填**目标文件的文件名（不含 `.md`）**。填好之后链接会自动双向长出来：

- 角色页底部出现「相关设定」
- 设定页底部出现「相关角色」和「相关条目」

不需要你手写任何链接。示例里 `example-aling` ↔ `example-tower` 就是这么互相指着的。

> ⚠️ **删条目时要清引用。** 如果 A 引用了 B，然后你删掉 B 的文件，构建会直接报错并告诉你
> 是哪个文件的哪一行 —— 这是故意的，免得出现死链。按报错提示把引用删掉即可。

### 三个常用开关

| 字段 | 作用 |
| --- | --- |
| `draft: true` | 暂时藏起来：不出现在列表、不生成页面。适合还没写完的内容 |
| `spoiler: mild / heavy` | 在详情页标题下方显示剧透提示 |
| `order: 数字` | 手动排序，越小越靠前（不写则默认 100） |

### 图片放哪里

统一放 `src/assets/`，frontmatter 或正文里用相对路径引用（从 `src/content/xxx/` 数起是 `../../assets/`）。
Astro 会自动转成 WebP、按需生成多个尺寸，不要直接把大图丢进 `public/`（那样不会优化）。

正文里插图：`![说明](../../assets/你的图.jpg)`。

---

## 目录结构

```
src/
├── components/           Header / Footer / BaseHead / 卡片 / 标签 / 剧透提示
├── content/
│   ├── characters/       角色档案（markdown）
│   ├── lore/             世界观设定条目
│   └── blog/             随笔
├── layouts/
│   ├── BlogPost.astro    文章页布局
│   └── DetailPage.astro  角色页 / 设定页共用的详情布局（主题色、信息栏、关联区块）
├── pages/
│   ├── index.astro       首页（四个房间的入口）
│   ├── characters/       角色列表 + 详情
│   ├── world/            世界观列表 + 详情
│   ├── blog/             随笔列表 + 详情
│   ├── about.astro       关于 / 授权说明
│   └── rss.xml.js        RSS
├── styles/global.css     全局样式
└── consts.ts             站点标题、描述、署名、社交链接
```

站点标题/描述在 `src/consts.ts`；站点地址（影响 RSS 与 sitemap 的绝对链接）在 `astro.config.mjs`
的 `site` 字段。

## 还没做的房间

按需要再做，都是在这套骨架上加集合，不影响现有内容：

- **画廊**：新增 `artworks` 集合（图片数组 + 角色关联 + 标签筛选），列表页做灯箱。
- **故事**：新增 `stories` 集合，支持连载章节与角色关联。
- **音乐**：先考虑托管方式 —— 音频不要直接进 git 仓库（GitHub Pages 单文件上限 100MB、
  站点建议 ≤1GB）。早期放 30–60 秒试听片段，正式版外链到对象存储或音乐平台嵌入。

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

站点内容（文字、画作、音乐）版权归作者所有，详见站内「关于」页。
模板来自 [withastro/astro](https://github.com/withastro/astro)（MIT）。
