# 签筒目录

这里存放**只出现在「抽签」里的条目** —— 它们不会进入世界观档案（角色列表、总览、
侧栏都不会出现），只会在 `/draw/` 抽签页与 `/draw/pool/` 签筒页里露面。

适合放这里的：

- 客串、玩梗、彩蛋性质的角色
- 还没想好归到哪一支种族的设定
- 只想给朋友抽着玩、不想正式入档的角色

## 怎么写

一个 `.md` = 一个条目，文件名就是网址最后一段（英文/拼音小写，例如 `mystery-cat.md`）。

```md
---
name: 名字                    # 必填
summary: 一句话简介            # 必填
kind: 角色                    # 角色 / 设定 / 其他，卡片上的小标签
title: 称号或他称              # 可选
ownership: 原创               # 原创 / 联动（联动时填 owner）
owner: 设主名                  # 联动必填
ownerUrl: 'https://…'         # 设主主页，填了以后名字可点
themeColor: '#AFFFFF'
portrait: '../../assets/oc/characters/xxx.webp'   # 立绘；没有就留空
aliases: ['别称']
height: 145cm
age: 不详
pronouns: 女
tags: ['标签']
canon: open                   # locked / open / draft
order: 100                    # 越小越靠前
---

正文：抽到之后点「看 TA 的完整档案」会进到 /draw/entry/文件名/，这里写详细设定。
```

- 抽签页写不下的字段（身高、年龄…）空着就不显示；一条都没有时会随机显示一句兜底文案
- `kind: 设定` 的条目照样能进签筒，只是卡片上标「设定」，档案字段通常更少
- 不想上线：`draft: true`

> 图片请交给站长压好再放进 `src/assets/`，别直接往这个目录塞大图。
