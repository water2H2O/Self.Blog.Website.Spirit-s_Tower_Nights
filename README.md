# 水塔夜谈 · Spirit's Tower Nights

一个原创 OC 世界观的网站：**世界观 · 种族 · 角色 · 故事 · 画廊 · 音乐**。基于 [Astro](https://astro.build/) 构建。

> 铃月镇边上那座废弃的水塔里，住着一个总说自己是笨蛋的水精灵。
> 这个仓库存放她所在世界的全部零件。

## 站点结构：个人区 + 企划区

站点分成两块，互不打扰：

| 区域 | 路径 | 放什么 |
| --- | --- | --- |
| **个人区** | `/`、`/blog/`、`/about/` | 个人首页、随笔、关于 —— 属于你自己的内容 |
| **企划区** | `/worldview/…` | 水塔夜谈世界观的全部内容（设定 / 种族 / 角色 / 故事 / 画廊 / 音乐） |

进入企划区后，页头会出现一条二级导航；离开企划区就消失。路径前缀定义在 `src/consts.ts` 的 `WORLDVIEW_BASE`。
（注意：改前缀时，`src/pages/worldview/` 下各页面里的内部链接也要一起改。）

### 标点约定

站内**正文与设定档案全部沿用你原始文档的引号风格**：对话与术语用 `“”` 和 `‘’`（不是 `“”`）。
这条规则是为了让站上的文字与你的文稿逐字一致 —— 尤其是故事正文，导入时不做任何字符替换。

## 图片暂存区（作者重新命名用）

`assets-staging/` 是**压缩后图片的暂存区**（已加入 `.gitignore`，不会进仓库）：
所有素材图片按源目录结构镜像存放在这里，保留原文件名，只把扩展名换成 `.webp`。
`assets-staging/_index.csv` 是完整的压缩对照表（UTF-8 带 BOM，可直接用 Excel 打开）。
你可以在这里随意重命名、分组，完成后告诉我新结构，我再导入 `src/assets/oc/`。
（`src/assets/oc/` 是**站上正在使用**的图片，删掉它页面会缺图。）
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

## 给写作者：怎么上传文字内容

这一节写给负责世界观文字的人。**只涉及三类文字**；图片、音乐与页面代码由站长处理。

### 你负责这三个目录

| 目录 | 内容 | 上线后的地址 |
| --- | --- | --- |
| `src/content/characters/` | 角色档案 | `/worldview/characters/<文件名>/` |
| `src/content/lore/` | 设定条目 | `/worldview/lore/<文件名>/` |
| `src/content/stories/` | 故事正文 | `/worldview/stories/<文件名>/` |
| `src/content/draw/` | 签筒专用条目（可选） | `/draw/entry/<文件名>/` |

前三个会进世界观档案（角色列表、设定索引、故事目录都能看到）。
**`src/content/draw/` 是例外**：放这里的条目只在抽签区域出现，档案页面也挂在 `/draw/` 下 ——
适合客串、玩梗、或者还没想好归到哪一支种族的角色。写法见该目录里的 `README.txt`。

**一个 `.md` 文件 = 一个条目**，文件名就是网址的最后一段（用英文或拼音小写 + 连字符，
例如 `miaomiao`、`act1-birdcage-2-1`；**不要用中文文件名**）。

其余目录请别动 —— `src/pages/`、`src/components/`、`src/styles/`、`public/`、`tools/`
都是站点本身，改错会让全站出问题。

### 两种上传方式

**① 网页版：什么都不用装（推荐）**

1. 在 GitHub 上打开对应目录，例如 `src/content/stories/`
2. 改已有的话：点开那个 `.md` → 点右上角铅笔图标 → 直接编辑
   新建的话：`Add file` → `Create new file` → 文件名写成 `<英文名>.md`
3. 拉到页面底部点 **Commit changes**（提交信息随便写，例如「新增 3-8」）
4. 等 1~2 分钟，站点自动重新构建上线

**② 本地版：想先在浏览器里看效果再用**

```sh
pnpm install
pnpm dev        # → http://localhost:4321
```

改完 `git add . && git commit -m "…" && git push`。

> 每次提交都会触发一次构建。写完一批提交一次就好，不必改一个字提交一次。

### 新建一个条目

**角色** → `src/content/characters/miaomiao.md`

```md
---
name: 淼渺                    # 必填
summary: 一句话简介            # 必填
race: 'elemental-spirit'      # 指向 src/content/races/ 里的文件名
ownership: 原创               # 原创 / 联动（联动时再填 owner 与 ownerUrl）
title: 莉莉安娜的“小药剂师”
aliases: ['水水']
height: 145cm
age: 不详
themeColor: '#AFFFFF'
tags: ['主角', '药剂师']
relations:                    # 人际关系，to 指向别的角色文件名
  - to: 'liliana-salambo'
    note: 庇护者与“绑架犯”
lore: ['miasma']              # 关联设定
canon: locked                 # locked / open / draft，见下方“吃书防线”
order: 10                     # 越小越靠前
---

## 1. 种族与身份

姓名：淼渺

种族：元素精灵

身份：……
```

**设定** → `src/content/lore/miasma.md`

```md
---
title: 瘴素                   # 必填
summary: 一句话说明            # 必填
category: 世界规则            # 世界规则 / 势力 / 地域 / 历史 / 神器 / 魔法体系
characters: ['miaomiao']      # 关联角色
races: ['elemental-spirit']   # 关联种族
related: ['cataclysm']        # 关联别的设定条目
canon: locked
order: 10
---

正文……
```

**故事** → `src/content/stories/act1-birdcage-2-1.md`

```md
---
title: 笼与蔷薇               # 必填
act: 第一幕：囚笼与飞翔        # 必填，幕
arc: 囚鸟篇                   # 必填，篇
code: '2-1'                   # 必填，话号（决定篇内顺序）
author: 水水                  # 不填默认水水；别人写的要写名字
summary: 一句话摘要            # 可选
characters: ['miaomiao']
status: published             # 改成 draft 就不上目录、不生成页面
order: 21
---

正文……
```

**故事文件名有格式**：`<幕>-<篇>-<话>`，例如 `act1-birdcage-2-1` = 第一幕 · 囚鸟篇 · 第 2 篇第 1 话。
上下话翻页、侧栏里「本篇的话」都靠它，新开一篇时照这个格式取名。

### 正文怎么写

- **段落之间空一行**，就是独立段落
- **对话**：每行末尾加一个反斜杠 `\`，会严格按行渲染（间距紧凑）
  ```
  飒岚：水水快看！穿过这片云——\
  淼渺：（小声）我、我还是怕高……\
  ```
- **引号用 `“”` 和 `‘’`**，不要用 `「」` —— 全站统一，导入时不做字符替换
- **不要手写 HTML**：正文里的 `<div>` 这类标签会被直接丢掉（**连里面的文字一起**），
  要排版就用 markdown 语法；实在需要 HTML 的场合找站长
- **「标签：值」连排会自动变成表格**：连续两行以上、每行都是 `xxx：yyy` 的形式，
  渲染时会合并成一张两列表格（角色卡那种）。想立刻在源文件里定下来，跑
  `node tools/apply-field-tables.mjs` —— 它改之前会**逐字校验**，对不上就跳过并报错

### 提交前自查

- frontmatter 的**必填字段**都填了。缺字段会让**整个站点**构建失败，
  错误信息里会写是哪个文件哪一行
- 引用别人的条目（`race:` / `lore:` / `characters:` / `related:` / `relations.to`）
  文件名拼写正确。**删条目时先把引用它的地方清掉**，否则构建会直接报错（这是故意的，免得留死链）
- 还没写完不想上线：加 `draft: true`（故事用 `status: draft`），条目会隐藏且不生成页面
- 提交后刷新 **https://water2h2o.com** 看一眼。构建失败会在 Cloudflare 项目页留日志，
  也可以直接把报错丢给站长

---

## 内容怎么写

站内有 **七个集合**，各管一类内容：

| 集合 | 目录 | 访问地址 | 用途 |
| --- | --- | --- | --- |
| `races` | `src/content/races/` | `/worldview/races/文件名/` | 种族档案：灾后状态、瘴素耐受、核心矛盾 |
| `characters` | `src/content/characters/` | `/worldview/characters/文件名/` | 角色档案 |
| `lore` | `src/content/lore/` | `/worldview/lore/文件名/` | 设定条目：世界规则、瘴素、神器、魔法体系…… |
| `stories` | `src/content/stories/` | `/worldview/stories/文件名/` | 故事正文，按“幕 → 篇 → 话” |
| `textbook` | `src/content/textbook/` | `/worldview/stories/textbook/文件名/` | **教材**：世界观里的书，一章一个文件 |
| `music` | `src/content/music/` | `/worldview/music/文件名/` | 与曲师合作的曲目 |
| `blog` | `src/content/blog/` | `/blog/文件名/` | 随笔（个人区，不在 /worldview/ 下） |
| `eden` | `src/content/eden/` | `/project/eden/文件名/` | 群创企划「伊甸园」的稿件 |
| `draw` | `src/content/draw/` | `/draw/entry/文件名/` | **签筒专用**：只出现在抽签区域的条目 |

> **签筒（`draw`）和角色档案是分开的。** 放这里的东西**不会**进角色列表、总览或侧栏，
> 只在 `/draw/` 与 `/draw/pool/` 露面（签筒页上带「签筒」角标）。
> 适合放客串、玩梗、还没想好归哪支种族的角色。目录里的写作说明见 `src/content/draw/README.txt`。
> 抽签的池子 = 这个目录的全部条目 + 角色集合里标了 `drawable: true` 的角色。
>
> **抽签限定**：`draw` 条目与 `characters` 条目都可以写 `limited: true`，
> 抽签卡与签筒卡上会挂一个金色「限定」角标，抽到后右侧档案里也会多一行「限定」。
> 这是纯展示标记，不影响概率 —— 限定角色照样按人数均分。

> **设定（`lore`）的类目表在 `src/lib/lore.ts`**，索引页与侧栏目录都读它 ——
> `LORE_CATEGORIES` 定顺序，`LORE_CATEGORY_NOTES` 是「这一类装什么」的一句话
> （索引页显示这句，侧栏链接的 `title` 也是这句）。
> 加类目只改 `lore.ts` 一处 + `content.config.ts` 的枚举，锚点、分组、条数都会自动跟上。
>
> 索引页是「左边类目跳转栏 + 右边按类目分节的宽卡」，锚点为 `/worldview/lore/#lore-<类目名>`；
> 侧栏的「设定」目录也按同一套类目分组。改完可以跑 `node tools/check-lore-layout.mjs`
> 验一遍产物（锚点对不对、条数对不对、侧栏组内条目数跟索引页是否一致）。
>
> 现有六类：**世界规则**（世界的底层机制，如大灾变、熵增衰变、时间环、命运三神、瘴素、天界与魔界）、
> **势力**（谁在统治：圣盾共和国、银辉联邦、奥法联合……）、**地域**（地理实体：交界地、云穹城邦……）、
> **历史**（精灵线、白塔试炼……）、**神器**、**魔法体系**。

> **画廊不在这个表里。** 它不是 markdown 集合，而是一个**图池**：
> 图片放在 `public/gallery/`，标注写在 `src/data/gallery-meta.json`，
> 由 `tools/build-gallery-pool.mjs` 生成。详见后面「画廊图池」。

> **教材（`textbook`）挂在「故事」下面，是第二个入口。**
> 它是世界观里的**书**（《T6 魔法指令集导论》，白塔学院第一学年课程总览），
> 所以与叙事正文分开存：`/worldview/stories/` 是「正文」标签，`/worldview/stories/textbook/` 是「教材」标签。
>
> - **一章一个文件**，粒度到章；章内的「5.1」「申明示例」「常见错误」这些小标题排在正文里。
> - 书的**全目录在 `src/lib/handbook.ts`**（`HANDBOOK_VOLUMES`）—— 先定目录再逐章写，
>   还没写的卷/章也列在里面，页面上自动标「待写」。写完一章就少一个待写标记。
> - 正文由 `python tools/import-textbook-docx.py <作者的 docx>` 逐字导入（只做标题层级与表格转换，
>   自检：源里每一段都要原样出现在产出里，对不上就不落盘）。加一章：先在 `handbook.ts` 补一条，再导一个 md。
>   导入器**按文本形状认标题、不认样式名** —— Word 那边的层级怎么排都不影响导入。
>
> **书稿（docx）的格式体检与修复**：`python tools/fix-textbook-docx.py <书.docx>`。
> 作者稿子里出过三个真问题，都在这个脚本里收拾：
>
> 1. **标题层级乱**：第 1–4 章完全没有标题样式（Word 导航窗格与自动目录都认不出）、
>    小节与栏目混用 Heading 3/4、卷与章缺分页符。脚本统一成「卷/序篇/结语 = 一级、
>    第 N 章 = 二级、N.N 小节与五个栏目 = 三级」，并给卷与章补上另起一页。
> 2. **标题继承主题字体会让 PDF 抓不到文字**：只套样式时 LibreOffice 导出的 PDF 会把中文标题
>    的字序打乱（提取出来是「第一卷　 ：法 、魔力与施法者总论 则」），于是量页码的脚本按行首
>    找不到标题、目录里那些行页码留空。脚本给标题补上**直接字体与字号**（微软雅黑）解决。
> 3. **正文里的交叉引用会被误判成标题**（「8.3 那三次记录，已经并排抄在本子上了；」
>    这种回指）：判据收紧成「编号 + 全角空格 + 不含句读」。
>
> 脚本只改样式与分页，**落盘前逐段复查正文，改了就回滚**。
> 改完书稿重跑作者的构建链（`_scripts/make_t6_skeleton.py` → `build_t6.py`）重新生成目录与 PDF，
> 再用 `python tools/check-textbook-pdf.py <pdf> <docx>` 独立核对 91 条目录页码。

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
canon: locked                  # 见下方“吃书防线”
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
title: 莉莉安娜的“小药剂师”
summary: 一句话简介
pronouns: 女
height: 145cm
age: 不详
themeColor: '#AFFFFF'
portrait: '../../assets/oc/characters/miaomiao-portrait.webp'
tags: ['主角', '药剂师']
relations:                     # 人际关系，指向其他角色
  - to: 'liliana'
    note: 庇护者与“绑架犯”
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
category: 世界规则           # 世界规则 / 势力 / 地域 / 历史 / 神器 / 魔法体系
themeColor: '#B6FF7A'
characters: ['miaomiao']
races: ['elemental-spirit']
related: ['cataclysm']       # 关联其他设定
canon: locked
order: 10
---
```

### 画廊

图池里的图不在 markdown 里逐张登记，标注（归属、设主、分类、尺寸）统一放在
`src/data/gallery-meta.json`，由 `tools/build-gallery-pool.mjs` 生成与维护 —— 详见后面「画廊图池」一节。
角色页的画作、企划页的立绘墙都是从同一个图池里按标注取图。

### 音乐

```md
---
title: Snowflower
number: 4
artist: Halv                 # 曲师（合作企划，必须署名）
cover: '../../assets/oc/music/halv-snowflower.webp'
audio: '/audio/04-snowflower.mp3'  # 站内音频（MP3 全平台通用）
duration: '2:37'
pvUrl: 'https://www.bilibili.com/video/…'
characters: ['miaomiao']
---
```

### 回响之殿：曲目与「小故事」

每首曲目一个文件，正文部分就是详情页上的「小故事」：

```md
---
title: Snowflower
number: 4
artist: Halv                   # 曲师
artistUrl: 'https://…'         # 曲师主页，填了以后曲师名可点击
illustrator: 茶地XD            # 曲绘画师
illustratorUrl: 'https://…'    # 可选
cover: '../../assets/oc/music/04-snowflower.webp'
audio: '/audio/04-snowflower.mp3'
duration: '2:37'
characters: ['miaomiao']       # 关联角色，会在详情页下方显示简介
pvUrl: 'https://www.bilibili.com/video/…'
themeColor: '#AFFFFF'
---

## 小故事

飒岚：水水快看！穿过这片云——\
淼渺：（小声）我、我还是怕高……\
（行尾的反斜杠是 markdown 硬换行，见下）
```

**换行规则（重要）**：markdown 会把连续几行合并成一个段落，所以

- **对话**：每行末尾加一个反斜杠 `\`，就会严格按行渲染（同一段内换行，间距紧凑）
- **旁白/散文**：段落之间空一行，就是独立的段落

两种可以混用：对话写成一组带 `\` 的连续行，旁白之间空行分段。

**粗体规则（重要，容易踩）**：本站的 Sätteri 处理器有一条脾气 ——

- `**粗体**` 的**开口标记前面**如果是中文（例如 `需在**300msv**`），这段不生效
- `**粗体**` 的**闭合标记后面**如果直接跟着中文（例如 `**凭证。**光球`），这段也不生效
- 两种情况都不会报错，而是把 `**` **原样印在页面上**，正文一个字都没错，所以逐字校验查不出来

改法很简单：在开口 `**` 前面、或闭合 `**` 后面**补一个空格**（页面上不可见），
或者把句末标点挪到标记外面（`**正文**。` 而不是 `**正文。**`）。正文一个字都不用动。

> 写完跑一次 `node tools/check-bold.mjs`（先 `pnpm run build`）：它会数每个页面
> 「源文里写了几处粗体 / 页面上渲染出几处」，对不上就报出来并给出改法。
> 全站体检用，新增条目单独验用 `node tools/check-entry.mjs <源 md> <dist 页面>`。

### 吃书防线：`canon` 三档

| 值 | 含义 | 站点表现 |
| --- | --- | --- |
| `locked` | 钉死的设定，写作时绝不能违背 | 详情页显示“正典 · 不可变更”绿色徽章 |
| `open` | 大方向已定，细节可继续长 | 显示“可扩展” |
| `draft` | 随时可能推翻 | 显示“草稿” |

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
失败项只警告不中断，退出码 = 失败数。采用“先写 .tmp 再原子改名”，中途失败不留半截文件。

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

### 音频：已从 WAV 转成 MP3

7 首曲目已全部转换并接入站内（`public/audio/*.mp3`，192 kbps，合计约 25 MB）。
转换脚本：`tools/audio-to-mp3.mjs` + `tools/audio-manifest.json`

```sh
node tools/audio-to-mp3.mjs --dry-run     # 只读元信息，不写文件
node tools/audio-to-mp3.mjs               # 按清单转换
```

- **为什么用 MP3 而不是 ogg**：`.ogg` 在所有 iPhone / iPad / Safari 上都不受支持，只出 ogg 会让苹果设备完全静音。
  MP3 全平台通吃。schema 里保留了可选的 `audioAlt` / `audioAltType`，将来想加一份体积更小的
  ogg/opus 作为备选格式，填上即可（播放器会按 `<source>` 顺序让浏览器自选）。
- **源 WAV 有三种格式**（16bit PCM / 24bit PCM / 32bit float，44.1k 与 48k 混用），脚本统一解码成 16bit
  再编码，不需要手动预处理。
- 编码器是纯 JS 的 **lamejs**（已 vendor 在 `tools/vendor/lamejs/`，LGPL-3.0，见其 `LICENSE`），
  **不依赖 ffmpeg 二进制** —— 本机网络拉不动那个 70 MB 的平台包。
- 源 WAV 约 273 MB，**不进仓库**；只有 MP3 进仓库。视频 PV 也不进仓库，用 `pvUrl` 外链。
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

- **时间线**：`行迹（故事）\历史事件线.xlsx` 那份**已经坏了** —— zip 里只剩 `[trash]/0000.dat` 修复痕迹，
  唯一的 Sheet1 是空的，单元格无内容。时间线正在用 `行迹（故事）\历史事件线.md` 重建；
  重建完建议直接做成站内结构化数据，这样 git 会替你留版本，也不会再无声损坏。
- **音乐**：7 首已接入站内；PV 外链（`pvUrl`）待补 B 站地址。
- **全量导入**：主线正文（第一幕 45 话 + 第二幕 8 话）与别传正文（11 话）都已批量导入，**站内共 59 话**；
  13 位角色 / 13 支种族 / 7 首曲仍是样本量，待逐批补齐。

## 当前环境下的必要配置

| 配置 | 原因 |
| --- | --- |
| `pnpm-workspace.yaml` 的 `nodeLinker: hoisted` | 沙箱会把符号链接/junction 呈现成普通目录，pnpm 默认 isolated 布局会导致依赖解析失败 |
| `astro.config.mjs` 的 `vite.resolve.preserveSymlinks: true` | Vite 在 Windows 上执行 `net use` 挑选 realpath 实现，沙箱禁止带管道的子进程（spawn EPERM），异常被静默吞掉后所有依赖解析返回空 → 纯 CommonJS 包报 `require is not defined` |
| `ASTRO_TELEMETRY_DISABLED=1`（见 `dev.cmd`） | Astro 遥测要写 `%APPDATA%\astro`，沙箱外不可写 |

## 导入 docx 档案（角色 / 种族）

角色与种族档案原本是 docx，导入分三步：

```sh
# 1) 提取成纯文本（保留段落顺序与表格，空文件会跳过并列在 _index.txt）
python tools/extract-docx.py "<源目录>" "<输出目录>" --recursive

# 2) 按 schema 写成 src/content/{characters,races}/*.md

# 3) 逐字校验：确认没有被改写或漏段
node tools/verify-verbatim.mjs --map=<映射.json>
```

- `extract-docx.py` 依赖 python-docx（DSH 自带；也可 `pip install python-docx`）。
  0 字节的 docx 不是合法 zip，会报 `Package not found` 并计入失败数 —— 那是源文件本身是空的
- `verify-verbatim.mjs` 把源文本按空行切段、去掉 markdown 标记与空白，逐段检查是否原样
  出现在 md 正文里。**任何改写、润色、漏抄都会让那一段匹配失败**，是防止"顺手改字"的保险
- **不要把中间产物写进 `src/content/` 目录**：glob loader 会把任何 `.md` 都当成内容条目，
  缺字段就直接让构建失败。临时文件放到 `src/` 之外

## 设定区（已恢复显示）

`/worldview/lore/` 曾经从导航里收起来过一段时间，现在**已经放回导航与总览**：

- 侧栏「设定」一栏会展开全部条目（当前条目高亮）
- 总览页也有对应的房间卡片
- 想再次隐藏：把 `src/components/Header.astro` 的 `worldviewLinks` 里那一行注释掉，
  并去掉 `src/pages/worldview/index.astro` 的 `rooms` 里对应卡片即可（页面本身不受影响）

## 画廊图池与品牌资源

### 画廊图池

画廊不按文件夹分组，而是从 `public/gallery/` 这个**图池**里随机抽图铺墙：

```sh
node tools/build-gallery-pool.mjs            # 把 assets-staging 摊平进图池，并更新标注
node tools/build-gallery-pool.mjs --dry-run  # 只看会做什么
```

- 标注文件 **`src/data/gallery-meta.json`**：`ownership`、`owner`（联动设主）、`kind`、`title`。
  重新跑脚本只补新文件与尺寸，**不会覆盖手改过的值**
- `ownership` 有四个**同级、互斥**的分类：`原创` / `联动` / `企划` / `其他`。页面按它筛选，
  每张图只属于其中一类（`企划` 是「水塔 OC 补完计划」的成品，页面上是绿色小标）
- 想再挂一批图进 `企划`：改 `tools/build-gallery-pool.mjs` 顶部的 `PROJECT_DIR` / `PROJECT_OWNERSHIP`
- `EXCLUDE` 数组里的文件名片段不会进图池（例如明确不要用的某张图）
- 归属对照表在脚本顶部的 `CHARACTERS` 里，改那里就能挪动原创／联动
- 文件名只保留「中文 + 字母数字 + `-` `_` + 全角括号」：实测 `&` `,` `#` 和空格
  会让静态服务器返回 404（147 个文件逐个测过）
- 页面每次打开随机抽 `SAMPLE_SIZE` 张（在 `src/pages/worldview/gallery/index.astro` 里改），
  大小、横竖、顺序都随机
- 水印是**页面叠加**的：截图带，右键另存的原图不带
- 照片墙本身是共享组件 [`src/components/GalleryWall.astro`](src/components/GalleryWall.astro)：
  画廊页与角色页用的是同一套（随机抽样、随机大小、水印、灯箱），后者不显示筛选按钮、
  也不排除任何分类（表情包与指针素材在角色页会一并铺开）

### 站点图标与分享图

```sh
node tools/build-brand-assets.mjs [logo.png]   # favicon.ico / favicon.png / apple-touch-icon.png / og-default.png
node tools/build-favicon-set.mjs               # 「网站小图标」轮换池
node tools/favicon-contact-sheet.mjs 150       # 把轮换池拼成一张联系表，方便肉眼挑
```

站内 32px 的图标（`favicon.png`）用「水」字：实测缩到 32px 仍然清晰，猫脸会糊，
整条字标完全不可读。iOS 图标与社交分享图用完整字标。

**标签页图标是一组会轮换的表情包**：`src/data/favicon-set.json` 里登记一批 64×64 的
透明抠图，页面加载时随机挑一张（`src/components/BaseHead.astro`）。

轮换池的取材规则（在 `tools/build-favicon-set.mjs` 顶部）：

- 只取 `kind` 为 `表情包`、**带透明通道且四角透明**的图 —— 也就是抠图，带背景的整图不要
- **按角色排除**：`EXCLUDE_CHARACTERS` 里的角色整体不进池子（目前是墨白，作者要求）
- `DIRECT` 列表里的素材不走透明筛选，而是按指定区域方形裁切
  （例如带背景的双人贴贴，就取中间那块框住两张脸）

## 部署（Cloudflare Workers + 自定义域名）

正式地址：**https://water2h2o.com**（域名在 Dynadot，DNS 托管在 Cloudflare）。
仓库远端：`git@github.com:water2H2O/Self.Blog.Website.Spirit-s_Tower_Nights.git`

控制台里的「创建应用」现在走的是 **Workers** 流程（Pages 正在并入 Workers），
所以仓库里有 `wrangler.jsonc`，部署命令是 `npx wrangler deploy`：

| 项 | 值 |
| --- | --- |
| 构建命令 | `pnpm run build` |
| 部署命令 | `npx wrangler deploy` |
| 输出目录 | `dist`（写在 `wrangler.jsonc` 的 `assets.directory`） |
| Node 版本 | 仓库根的 `.node-version`（22.12.0），构建镜像会读它，不用在控制台设环境变量 |

`wrangler.jsonc` 的 `name` 必须和控制台里的项目名一致，否则会部署到另一个 Worker 上。
连上仓库后每次 push 到 `main` 会自动构建部署。

要点：

- 站点挂在**域名根目录**，所以 `astro.config.mjs` 里只需要 `site`、**不需要 `base`**
- 每次 push 后 1~2 分钟上线；构建失败在 Cloudflare 项目页有日志
- 截图分享（og:image）与 sitemap 都用 `site` 拼绝对地址，换域名只改那一处
- 主机在境外，**不需要备案**；代价是用不了大陆 CDN
- 单文件上限 25 MB：图片与 MP3 都没问题，**PV 视频别放进来**，继续走 B 站外链

## 许可

站内文字、画作、音乐版权归作者所有，详见站内[关于](/about/)页。
模板来自 [withastro/astro](https://github.com/withastro/astro)（MIT）。
