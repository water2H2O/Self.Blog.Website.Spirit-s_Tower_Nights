# 水塔夜谈 · Spirit's Tower Nights

一个原创 OC 世界观的网站：**世界观 · 种族 · 角色 · 故事 · 画廊 · 音乐**。基于 [Astro](https://astro.build/) 构建。

> 铃月镇边上那座废弃的水塔里，住着一个总说自己是笨蛋的水精灵。
> 这个仓库存放她所在世界的全部零件。

## 快速开始

```sh
dev.cmd install     # 安装依赖
dev.cmd dev         # 启动开发服务器 → http://localhost:4321
dev.cmd build       # 构建静态站点到 dist\
dev.cmd preview     # 预览构建结果
```

`dev.cmd` 会自动接入 DSH 内置的 Node/pnpm 运行时，并把 pnpm 缓存放在工作区内的 `..\.dsh-cache`。
机器上已装好 Node 时，直接 `pnpm install` / `pnpm dev` 即可。

---

## 内容怎么写

站内有 **七个集合**，各管一类内容：

| 集合 | 目录 | 访问地址 | 用途 |
| --- | --- | --- | --- |
| `races` | `src/content/races/` | `/races/文件名/` | 种族档案：灾后状态、瘴素耐受、核心矛盾 |
| `characters` | `src/content/characters/` | `/characters/文件名/` | 角色档案 |
| `lore` | `src/content/lore/` | `/world/文件名/` | 设定条目：世界规则、瘴素、神器、魔法体系…… |
| `stories` | `src/content/stories/` | `/stories/文件名/` | 故事正文，按「幕 → 篇 → 话」 |
| `gallery` | `src/content/gallery/` | `/gallery/` | 一张图一条记录 |
| `music` | `src/content/music/` | `/music/` | 与曲师合作的曲目 |
| `blog` | `src/content/blog/` | `/blog/文件名/` | 随笔与制作花絮 |

新增内容 = 在对应目录下新建 `.md`，**文件名就是网址的最后一段**。

### 种族（创作的起点）

```md
---
name: 元素精灵
epithet: 旧时代的遗民          # 方括号里的称号
aliases: ['精灵', '自然之灵']
summary: 一句话简介
themeColor: '#AFFFFF'
miasmaTolerance: 极度脆弱
population: 仅存少量个体
habitat: 瘴素浓度较低的地区
conflicts:                     # 核心矛盾，会在详情页顶部单独成块
  - 生存与消亡：……
canon: locked                  # 见下方「吃书防线」
tags: ['核心种族']
order: 10
---
```

### 角色

```md
---
name: 淼渺
race: 'elemental-spirit'       # 必填，指向种族文件名
aliases: ['水水']
title: 莉莉安娜的「小药剂师」
summary: 一句话简介
pronouns: 女
height: 145cm
age: 不详
themeColor: '#AFFFFF'
portrait: '../../assets/oc/characters/miaomiao-portrait.webp'
tags: ['主角', '药剂师']
relations:                     # 人际关系，指向其他角色
  - to: 'liliana'
    note: 庇护者与「绑架犯」
lore: ['miasma']               # 关联设定
canon: locked
order: 10
---
```

### 故事（幕 → 篇 → 话）

```md
---
title: 淼渺
act: 第一幕：囚笼与飞翔       # 幕
arc: 元素精灵篇               # 篇
code: '1-1'                   # 话号，同时决定篇内排序
summary: 一句话摘要
characters: ['miaomiao']
races: ['elemental-spirit']
status: published             # draft 则不上目录、不生成页面
order: 11
---
```

阅读顺序 = 先按幕（`第一幕` → `第二幕`，在 `src/lib/stories.ts` 里维护），再按 `order`，最后按话号自然排序。
阅读页会自动生成上一篇 / 下一篇和进度（第 N / M 话）。

### 设定条目

```md
---
title: 瘴素
summary: 一句话说明
category: 瘴素               # 世界规则 / 瘴素 / 神器 / 魔法体系 / 势力 / 地理 / 历史 / 概念
themeColor: '#B6FF7A'
characters: ['miaomiao']
races: ['elemental-spirit']
related: ['cataclysm']       # 关联其他设定
canon: locked
order: 10
---
```

### 画廊

```md
---
title: 全身插画
image: '../../assets/oc/gallery/miaomiao-fullbody.webp'
kind: 插画                   # 立绘 / 插画 / 曲绘 / 头像 / 设计稿 / 表情包 / 周边
characters: ['miaomiao']
artist: 画师名                # 非本人作品时填
tags: ['全身']
download: 'https://…'        # 周边类（如鼠标指针主题）的下载地址
order: 10
---
```

画廊页支持**类型 + 角色双维度筛选**和点击放大（灯箱）。

### 音乐

```md
---
title: Snowflower
number: 4
artist: Halv                 # 曲师（合作企划，必须署名）
cover: '../../assets/oc/music/halv-snowflower.webp'
audioOgg: '/audio/snowflower.ogg'   # 音频做好后填，见下方「音频规范」
audioM4a: '/audio/snowflower.m4a'
pvUrl: 'https://www.bilibili.com/video/…'
characters: ['miaomiao']
---
```

### 吃书防线：`canon` 三档

| 值 | 含义 | 站点表现 |
| --- | --- | --- |
| `locked` | 钉死的设定，写作时绝不能违背 | 详情页显示「正典 · 不可变更」绿色徽章 |
| `open` | 大方向已定，细节可继续长 | 显示「可扩展」 |
| `draft` | 随时可能推翻 | 显示「草稿」 |

目前标为 `locked` 的：世界观正文里的世界规则、大灾变真相、瘴素、魔法分级 T0–T6，以及元素精灵与天翼种两支种族的完整档案。
**当你怀疑某处是不是吃书了，就看这个徽章。**

### 其他常用字段

| 字段 | 作用 |
| --- | --- |
| `draft: true` | 隐藏：不出现在列表、不生成页面（所有集合都支持） |
| `spoiler: mild / heavy` | 详情页显示剧透提示 |
| `order: 数字` | 手动排序，越小越靠前（默认 100） |
| `themeColor: '#rrggbb'` | 每个角色/条目一个主题色，卡片、标题、关联区块跟着变 |

> ⚠️ **删条目时要清引用。** 如果 A 引用了 B，你删掉 B 的文件，构建会直接报错并指出是哪个文件哪一行。
> 这是故意的，免得出现死链。

---

## 图片与音频：压缩是硬约束

原始素材合计约 **2.1 GB**（PNG 347 MB、WAV 353 MB、视频 1.1 GB），**绝不能直接进仓库**。
GitHub Pages 的限制是单文件 100 MB、站点建议 ≤1 GB，而且仓库会越克隆越慢。

### 图片压缩管线

`tools/optimize-images.mjs`（用项目里已有的 sharp，无需额外安装）：

```sh
# 编辑 tools/image-manifest.json 后运行
node tools/optimize-images.mjs
node tools/optimize-images.mjs --dry-run          # 只报数不写文件
node tools/optimize-images.mjs --manifest=其它清单.json
```

清单每项：`{ "src": 源图绝对路径, "out": "src/assets/oc/…webp", "maxEdge": 1600, "quality": 82 }`

脚本会：缩放到长边不超过 `maxEdge`（小图不放大）→ 转 WebP（保留透明通道）→ 打印体积对比 →
失败项只警告不中断，退出码 = 失败数。采用「先写 .tmp 再原子改名」，中途失败不留半截文件。

**已完成的样本（13 张）**：67.60 MB → **1.71 MB（压缩率 97.48%）**

| 用途 | 规格 | 实测体积 |
| --- | --- | --- |
| 角色立绘 | 长边 1600 / q82 | 115 KB |
| 画廊插画 | 长边 1600 / q80 | 82–346 KB |
| 曲绘 | 长边 1200 / q82 | 118–165 KB |
| logo | 1024 / q90 | 57 KB |

站内 `<Image>` 会再按显示尺寸生成响应式变体，所以**仓库里每张图只存一份**即可。

> 源目录里还有更大的图（如 61 MB 的 `Kyakii-OBLIVION.png`、22 MB 的 `多人插-和鸟姐姐一起玩水花.png`），
> 全量导入时往清单里追加条目就行。**PSD / zip / ANI / 视频一律不进仓库。**

### 音频规范（重要）

**只导出 `.ogg` 会让所有 iPhone / iPad / Safari 访客听不到声音** —— Safari 至今不支持 Ogg 容器。
正确做法是同一首导出两份，用 `<source>` 让浏览器自己挑：

| 格式 | 编码 | 建议码率 | 4 分钟约 | 用途 |
| --- | --- | --- | --- | --- |
| `.ogg` | Opus | 96–112 kbps | 约 3 MB | Chrome / Firefox / Edge / Android |
| `.m4a` | AAC | 128 kbps | 约 4 MB | Safari / iOS 兜底 |

音乐页的播放器已按双 `<source>` 写好，音频文件放进 `public/audio/` 后填 `audioOgg` / `audioM4a` 即可。
视频 PV 不进仓库，用 `pvUrl` 外链（B 站等）。

---

## 目录结构

```
src/
├── components/      Header / Footer / BaseHead / 卡片 / 标签 / 剧透提示
├── content/         七个集合的内容（见上表）
├── layouts/
│   ├── BlogPost.astro    文章页
│   └── DetailPage.astro  角色 / 种族 / 设定共用的详情布局（主题色、正典徽章、信息栏、关联区块）
├── lib/stories.ts   故事的排序与分组逻辑（幕的顺序在这里维护）
├── pages/           路由
├── styles/global.css 全局样式（深色主题与配色变量）
└── consts.ts        站点标题、描述、署名、社交链接
tools/
├── optimize-images.mjs    图片压缩脚本
└── image-manifest.json    压缩清单
```

## 视觉规范

- 主色 **`#AFFFFF`**（淼渺代表色）—— 用于辉光、描边、强调。它在白底上几乎不可读，所以**全站是深色主题**
- 可读的青色强调 `--accent: #6FE3EC` 用于链接与交互态
- 配色变量集中在 `src/styles/global.css` 的 `:root`，改一处全站生效
- 每个角色 / 种族 / 条目可用 `themeColor` 覆盖自己的主题色

## 待办

- **时间线**：`参考文件\历史事件线.xlsx` 与 `行迹（故事）\历史事件线.xlsx` 两份完全相同，且**内部是空的**
  （zip 里有 `[trash]/0000.dat` 修复痕迹，A1 单元格无内容）。时间线需要重建；
  建议直接做成站内结构化数据，这样 git 会替你留版本，也不会再无声损坏。
- **音乐音频**：等网页版 ogg + m4a 导出后接入。
- **全量导入**：13 位角色 / 13 支种族 / 约 50 话主线 / 7 首曲，目前只上了样本。

## 当前环境下的必要配置

| 配置 | 原因 |
| --- | --- |
| `pnpm-workspace.yaml` 的 `nodeLinker: hoisted` | 沙箱会把符号链接/junction 呈现成普通目录，pnpm 默认 isolated 布局会导致依赖解析失败 |
| `astro.config.mjs` 的 `vite.resolve.preserveSymlinks: true` | Vite 在 Windows 上执行 `net use` 挑选 realpath 实现，沙箱禁止带管道的子进程（spawn EPERM），异常被静默吞掉后所有依赖解析返回空 → 纯 CommonJS 包报 `require is not defined` |
| `ASTRO_TELEMETRY_DISABLED=1`（见 `dev.cmd`） | Astro 遥测要写 `%APPDATA%\astro`，沙箱外不可写 |

## 部署到 GitHub Pages

仓库远端：`git@github.com:water2H2O/Self.Blog.Website.Spirit-s_Tower_Nights.git`
尚未配置自动部署；需要时在仓库 Settings → Pages 选 GitHub Actions 并添加官方 `withastro/action` 工作流。
使用自定义域名时记得同步改 `astro.config.mjs` 的 `site`。

## 许可

站内文字、画作、音乐版权归作者所有，详见站内[关于](/about/)页。
模板来自 [withastro/astro](https://github.com/withastro/astro)（MIT）。
