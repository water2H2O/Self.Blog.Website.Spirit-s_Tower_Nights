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

### 关于页：一页分区展示

- `/about/` 不再使用随笔布局：个人介绍与配图、创作入口、联系方式、完整友链、站点与授权摘要统一展示，并提供页内分区导航。
- 友链仍只维护 `src/data/friends.ts`，全部显示，不再按前几条截断。
- 旧地址 `/about/friends/` 与 `/about/site/` 分别跳转到 `/about/#friends` 与 `/about/#site`。Astro 静态构建生成带 canonical、noindex 和备用链接的跳转页；站点健康检查按跳转目标校验 canonical，并继续校验目标和锚点。
- 授权全文继续保留在 `/license/`，完整建站历史继续保留在 `/blog/site-changelog/`，关于页不再重复维护一份“最近更新”。

### 设定详情页的配图展示

- 设定详情页采用纯文字档案布局，不展示顶部封面或“暂无配图”占位框。
- 共用的 `DetailPage` 通过 `showCover={false}` 关闭图片区，默认值仍为 `true`，因此种族与角色页保持原有配图展示。
- 这里只改变页面展示，不删除图片文件或内容中的 `cover` 字段；分享图元信息仍可使用封面。

### 界面文案与本地验收

- 导航和按钮直接说明去向或动作；页面介绍面向来访读者，不把内部文件路径、数据来源和实现细节当作操作说明。
- 空状态、未完成内容和播放失败要如实说明，不承诺尚未实现的功能，也不把所有失败都归因于浏览器。
- 保留栏目专名、作者的个人语气与授权边界；润色界面时不改小说、设定和教材正文。
- 需要先看效果时，运行 `dev.cmd dev --host 127.0.0.1 --port 4321`，以终端实际输出的地址为准。验收后再提交、推送；不要把本地预览当作已经上线。

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
| `blog` | `src/content/blog/` | `/blog/<短码>/` | 随笔（个人区，不在 /worldview/ 下） |
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

### 随笔的网址用短码

随笔的文件名照样是给人看的长名字（`a-fish-rearranges-the-about-page.md`），
但**访问地址是 6 位短码**（`/blog/1lrpd2/`）—— 二十多字的 slug 贴在地址栏里又长又难抄。

- 短码由文件名算出来（FNV-1a → base36 6 位），见 `src/lib/blog-code.ts`；
  **改文件名 = 换短码**，所以定稿后别再重命名文件
- 详情页、列表页、RSS 三处共用同一份映射，加新随笔不用改代码
- 换短码之前的旧地址（`/blog/site-changelog/` 这类）在 `public/_redirects` 里 301 到新地址；
  以后若再改文件名，记得补一行

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

### 移动端适配（主要断点 640 / 720 / 860px）

- **页头**：≤640px 收成 56px 的单行 —— 左边 logo、右边汉堡按钮，导航是两列浮层。
  纯 CSS 实现（`#nav-toggle` checkbox + label），没有 JS 也能开关；640–900px 仍横排，只缩小字号。
  改之前六个栏目在手机上会折成两行，吸顶页头高 107px。
- **入场协议**：面板是「固定头 + 独立滚动的条款 + 固定按钮」的竖向 flex ——
  只有 `.articles` 滚动，「同意 / 拒绝」在任何窗口尺寸下都不用先滑到底。
  窄屏用 `dvh` 控制面板高度，横屏 / 矮窗口再收起说明文字给条款让位。
- **抽签**：≤860px 收起未抽取时的档案占位与「？」签纸；抽完的顺序是 卡 → 运势 → 再摇 → 档案。
  注意脚本 `createElement` 出来的档案字段和历史头像拿不到 Astro 的 scoped 属性，
  样式必须写成 `:global(...)`，否则会变成大图和堆叠的两行。
- **回响之殿**：≤640px 曲绘与文案上下叠，长标题不再被挤成四行。
- **角色索引**：卡片网格下限 250px，手机一列铺满，立绘压成 4:3。
- **表格**：≤720px 两列字段表拆成一格一行（见 `global.css`）。
- **点击区**：返回 / 面包屑、画廊筛选、试听、页脚图标都按 44px 最小尺寸处理；
  故事与教材目录的整行标题做成可点区域。
- **验证方式**：Chrome DevTools 设备模拟（390×844、360×800、320×568）逐页检查横向溢出并截图；
  构建后跑 `node tools/site-health.mjs`。

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
| `.npmrc` 的 `node-linker=hoisted` | Cloudflare 构建用的 **pnpm 9 不读** `pnpm-workspace.yaml` 里的 `nodeLinker`，只认 `.npmrc`；两处都写才能让本地与 CI 用同一种扁平布局 |
| `pnpm-workspace.yaml` 的 `packages` 字段 | pnpm 9 只要看到这个文件就要求它，缺了直接中止构建（详见「部署」一节的 pnpm 版本坑） |
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

- 标注文件 **`src/data/gallery-meta.json`**：`ownership`、`owner`（联动设主）、`kind`、`title`、
  `characters`（画面里都有谁）。重新跑脚本只补新文件与尺寸，**不会覆盖手改过的值**；
  但 `AUTHOR_NOTES` 里明确写了的字段以脚本为准
- **一张图可以同时出现在多个角色页**：`characters` 数组记录画面里的所有人
  （淼渺×飒岚、淼渺+白茶+祈、淼渺×天涯…），角色的「画作」区按它筛选。
  作者逐张确认过的归属、标题、画面成员写在脚本顶部的 **`AUTHOR_NOTES`** 里 ——
  写清单没用，因为图池每次重建都从 staging 重算元数据
- `ownership` 有四个**同级、互斥**的分类：`原创` / `联动` / `企划` / `其他`。页面按它筛选，
  每张图只属于其中一类（`企划` 是「水塔 OC 补完计划」的成品，页面上是绿色小标）
- **别人的立绘要打水印**，判定按「画是谁的」而不是「角色是谁的」：
  企划与平行时空目录的图、以及联动角色的图都打斜排 `sample` 水印，自己的原创角色不打，
  表情包不打。水印在**重建图池时生成**（源文件保持干净、可重复跑），
  打了的条目在清单里带 `watermark: 'sample'`
- 想再挂一批图进 `企划`：改 `tools/build-gallery-pool.mjs` 顶部的 `PROJECT_DIR` / `PROJECT_OWNERSHIP`
- `EXCLUDE` 数组里的路径片段不会进图池（例如明确不要用的某张图，或**内容重复的副本** ——
  同一个文件散在多个来源目录里时，只留带角色归属的那份）
- 归属对照表在脚本顶部的 `CHARACTERS` 里，改那里就能挪动原创／联动；
  某条目的 `as` 字段表示「文件名里叫这个，但归属归到那个角色」（苯胺 → 芳基胺、
  戴薇娜 → 薇奥拉）：归属名与文件名前缀是两回事，后者保持不变，否则整批文件会改名
- 文件名只保留「中文 + 字母数字 + `-` `_` + 全角括号」：实测 `&` `,` `#` 和空格
  会让静态服务器返回 404（147 个文件逐个测过）
- 页面每次打开随机抽 `SAMPLE_SIZE` 张（在 `src/pages/worldview/gallery/index.astro` 里改），
  大小、横竖、顺序都随机
- 除了烧进图里的 `sample` 水印，页面还**叠一层**署名水印：截图带，右键另存的原图不带
- 照片墙本身是共享组件 [`src/components/GalleryWall.astro`](src/components/GalleryWall.astro)：
  画廊页与角色页用的是同一套（随机抽样、随机大小、水印、灯箱），后者不显示筛选按钮、
  也不排除任何分类（表情包与指针素材在角色页会一并铺开）

> 排查用的两支小工具：`node tools/site-health.mjs --content` 查全站问题 ——
> **死链、缺资源、404 页有没有产出、`<title>` 有没有重复、站内锚点有没有指空、
> canonical 是否与实际地址一致**，再加 `--content` 会连内容缺口一起报；
> `python tools/tag-multi-character.py` 列出「文件名里出现多个角色」的图并补 `characters`。

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

## 定时任务：主页的 GitHub 热力图每天自动刷新

主页「最近在写什么」那一块的**贡献热力图与仓库列表**，数据来自 `src/data/github.json`。
它是**构建时读的缓存**，不是实时请求 —— 好处是构建不依赖网络，接口抽风也能出站。

自动更新走 GitHub Actions（`.github/workflows/refresh-github.yml`）：

| 项 | 值 |
| --- | --- |
| 触发 | 每天 22:10 UTC（= 次日 06:10 UTC+8），也可以在 Actions 页面手动 `Run workflow` |
| 为什么挑这个点 | GitHub 的贡献日历按 **UTC 天**算，这时 UTC 的一天刚好过完，抓到的数据是完整的 |
| 做什么 | 抓数据 → 体检 → **有变化才提交** → Cloudflare 照常自动部署 |
| 权限 | `permissions: contents: write` —— 只用仓库自带的写权限，不需要另配 token 或密码 |
| 并发 | `concurrency` 锁住，同一时间只跑一个，避免两个提交撞在一起 |

**本机想立刻刷一次**（改完抓取逻辑验证、或不想等到早上）：

```bash
pnpm run github:refresh     # 只抓数据，并打印这次变了什么（哪些日期等级变了、仓库增删）
pnpm run github:build       # 抓完再跑一次构建
```

抓取脚本是 `tools/fetch-github.mjs`，体检脚本是 `tools/check-github-data.mjs`
（Action 在提交前会过这一关：万一 GitHub 改了页面结构、抓到半截数据，
宁可让那次 Action 失败，也不要把残缺的热力图提交上去）。

> 热力图右下角那行「数据截至 …」就是这份缓存的区间末端；GitHub 个人页上的格子
> 如果显示得更多，等到下一次刷新就会对齐。

## 主页的 token 用量 K 线

首页底部那块「最近在烧什么」是 token 用量，画成按天的 K 线：一根蜡烛 = 一天。

**口径**：`tokens` = 输入 + 输出 + **缓存命中**，也就是当天烧掉的全部。缓存占九成九，
但图上要的就是这个"热闹"；`cacheRead` 仍然在 JSON 里单列一份备查。

**数据从哪来**：两条路，选一条。站上**当前用的是第二条**（官网导出，带 ¥ 花费、覆盖所有客户端）。

### 一、平台用量导出（带花费，站上现在用这条）

官网上能直接导出，不需要 token：

1. 登录 <https://platform.deepseek.com/usage>
2. 点右上角的「导出 / Export」，**选好日期范围**，浏览器会下载一个 zip
3. 让脚本读它：

```sh
node tools/fetch-token-usage.mjs --zip="C:\Users\你\Downloads\usage_data_2026-09-22_2026-10-21.zip"
# 已经解开的目录也行：
node tools/fetch-token-usage.mjs --dir="...\解压后的目录"
```

导出按钮坏了还可以直接调接口（要登录态 `userToken`）：

```sh
# 浏览器控制台执行 localStorage.getItem("userToken")，结果原样存进 tools/.deepseek-user-token
# （已 gitignore），或设环境变量 DEEPSEEK_USER_TOKEN
node tools/fetch-token-usage.mjs --months=3
```

**要合并中转站**（另一家网关的多模型用量），加 `--relay=`，**可以给多份**（不同日期段的导出会重叠）：

```sh
node tools/fetch-token-usage.mjs \
  --zip="C:\Users\你\Downloads\usage_data_2026-09-22_2026-10-21.zip" \
  --relay="C:\Users\你\Downloads\usage_2026-10-09_to_2026-10-22.csv" \
  --relay="C:\Users\你\Downloads\usage_2026-10-21_to_2026-10-22.csv"
```

中转站表格只需要这几列（多出来的列忽略）：`Time`、`Model`、`Input Tokens`、`Output Tokens`、
`Cache Read Tokens`、`Cache Creation Tokens`、`Billed Cost`。合并规则：

- **直接相加** —— 中转站的量不在 DeepSeek 官方账单里，两边 token 口径一致（输入 + 输出 + 缓存）
- **多份表按「时间戳 + 模型 + 各项 token」去重**，重叠的请求只算一次（日期段互相包含也不会翻倍）
- 官方那几段加前缀 `官方 · `，中转站是 `中转站 · <模型名>`，图上按「来源 · 模型」堆叠
- 花费 = 官方 ¥ + 中转站 Billed Cost（中转站按它自己的账单口径，币种未标注，默认当人民币）；
  每个系列的 `cost` 也单独记着，首页那句「Claude 花了我 xx 元」就是读它
- 中转站表格随时可以重新导出，再跑一遍同一条命令即可覆盖更新

**安全**：token 只从上面两个地方读，永远不进仓库。导出的 CSV 里有明文 api_key，
脚本**按列名**只取 time / model / type / amount / cost —— 不打印、也不写进产物。

**OHLC 怎么来**：

- 文件带小时桶（单日导出那样，一天多个时段）→ 按小时算，蜡烛有影线
- 只有按天合计（范围导出，每天只有 00:00 一个桶）→ 用「前一日收盘 = 今日开盘」，这是日线画蜡烛的标准做法

**文件名**：认 `amount-2026-09-22_2026-10-21.csv`（日期范围），也认 `amount-2026-10.csv`（整月）。

### 二、本机 DSH 会话日志（不需要任何凭据）

DSH 的会话文件里本来就记着每次请求的 `usage`，直接统计即可，**不联网、不需要 token、不需要 API key**：

```sh
node tools/collect-local-usage.mjs            # 扫 ~/.dsh/sessions，默认最近 90 天
node tools/collect-local-usage.mjs --days=180 # 只留最近 N 天
```

两种来源产出的 JSON 结构一样（`daily[]` 带 `open / close / high / low`），图表直接用。
代价：只统计**这台机器上经 DSH 产生的用量**，也没有花费金额（第四格会显示「日均」而不是「花费」）。

> 两边的数字会有一点出入：同一天本机日志通常比官网高一些（harness 上报的口径包含重试等），
> 且覆盖不到别的客户端。**以官网为准**。

两条路都写同一个 `src/data/token-usage.json`，写完照常提交推送即可。数据为空（`daily: []`）时
**整块不渲染**，所以没跑过也不会在首页留个空框。

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
- **404 页由 `src/pages/404.astro` 产出**：`wrangler.jsonc` 的 `not_found_handling: "404-page"`
  就是靠 `dist/404.html` 兜底，删了那个文件访客输错地址只会看到 Cloudflare 的默认错误页
  （`node tools/site-health.mjs` 会检查它还在不在）
- 站内链接**一律带尾斜杠**（`/worldview/`）：页面都是「目录 + index.html」，
  少写一个斜杠就会先吃一次 307，每次点导航多一个来回

### 构建环境的 pnpm 版本：本地 11，Cloudflare 9

**这是建站以来唯一一次「推上去了但站点不动」的故障，2026-10-17 记在这里。**

本地（DSH 内置）是 pnpm **11.7.0**，Cloudflare 构建镜像默认是 pnpm **9.10.0**。
构建日志里那行 `Detected the following tools from environment: nodejs@22.12.0, pnpm@9.10.0`
就是它 —— nodejs 那半截来自 `.node-version`，pnpm 那半截是镜像的默认值。

差异点：**pnpm 9 起，只要仓库里存在 `pnpm-workspace.yaml`，就要求里面有 `packages` 字段**。
没有的话在「安装依赖」这一步直接中止，整个构建 16 秒结束，站点保持旧版本：

```
Detected the following tools from environment: nodejs@22.12.0, pnpm@9.10.0
Installing project dependencies: pnpm install --frozen-lockfile
ERROR  packages field missing or empty
Failed: error occurred while installing tools or dependencies
```

pnpm 11 不要求这个字段，所以**本地永远构建正常、只有线上会挂** ——
「本地构建通过」不能当作「CI 也会通过」的证据。

故障时的表象（很容易误判成「Cloudflare 没触发部署」）：

- GitHub 上提交都在，`main` 是最新的
- 仓库页出现一条失败检查：`Workers Builds: <项目名>`
- 线上内容停在旧构建：sitemap 页数比本地少、新文章 404

**怎么确认线上到底跑没跑过**：比线上与本地的页面清单。sitemap 是构建产物，
不受 CDN 缓存影响，差集就是没上线的页面：

```powershell
node -e "const fs=require('fs');const locs=s=>s.split('<loc>').slice(1).map(x=>x.split('</loc>')[0]);(async()=>{const L=locs(await (await fetch('https://water2h2o.com/sitemap-0.xml')).text());const M=locs(fs.readFileSync('dist/sitemap-0.xml','utf8'));console.log('线上 '+L.length+' 页 / 本地 '+M.length+' 页');M.filter(u=>!new Set(L).has(u)).forEach(u=>console.log('  未上线: '+u))})()"
```

**改 pnpm 相关配置（`pnpm-workspace.yaml` / `.npmrc` / 锁文件）时必须按 pnpm 9 校验一遍**，
别只信本地 pnpm 11。不必装依赖、也不写 `node_modules`，拿一个只含
`package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` / `.npmrc` 的临时目录即可：

```powershell
node <pnpm9>/bin/pnpm.cjs install --frozen-lockfile --lockfile-only
```

兜底手段：如果哪天 pnpm 9 又因为别的设置不认，可以在 `package.json` 里加
`"packageManager": "pnpm@<版本>"` —— Cloudflare 的版本检测读的就是这个字段
（和 `.node-version` 同一套机制），会据此装指定版本的 pnpm。

## 每次改完的提交流程（DSH 会自动走一遍）

这个仓库是 **push 即部署**，没提交等于没改。改动落地后不要停在「本地通过」，顺序固定：

1. **自检**：`dev.cmd build` 退出码 0；改了内容类文件再跑一遍 `node tools/site-health.mjs`
2. **看工作区**：`git status --short` 确认没有夹带临时文件、探测文件、`dist/`、`assets-staging/`
3. **提交**：`git add -A` → 提交信息用中文写清「改了什么 + 为什么」，**一条提交只说一件事**；
   历史上大多是直接的中文动宾句（如「修正脚本与工具里工作区路径写法…」），需要时加
   `fix:` / `feat:` / `chore:` 前缀
4. **先同步再推**：`git pull --rebase` → `git push`
   （远端常被每日热力图那条自动提交抢先，rebase 后再推）
5. **验证上线**：等 1~2 分钟，用上面那条命令比线上 sitemap 与本地构建的页面数，新页面应能 200；
   构建失败就去 Cloudflare 项目页看日志，**先怀疑 pnpm 版本差异**

> 收尾时工作区必须是干净的：`git status` 只剩 nothing to commit 才算这次改动完成。

## 许可

站内文字、画作、音乐版权归作者所有，详见站内[关于](/about/)页。
模板来自 [withastro/astro](https://github.com/withastro/astro)（MIT）。
