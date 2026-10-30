# 给 AI 协作者（DSH）的常驻约定

本仓库长期有效的规则。每次会话都适用，不需要用户重复交代。

## 一、每次改完必须自己走一遍提交

**这个仓库是 push 即部署**：没有提交、没有推送，就等于没改。改动落地后不要停在「本地通过」，
按顺序做完：

1. **自检**：构建退出码 0 —— Windows 用 `dev.cmd build`，Linux / macOS 用 `pnpm build`。
   改了内容类文件再跑 `node tools/site-health.mjs`。
2. **看工作区**：`git status --short` —— 确认没有夹带临时文件、探测文件、`dist/`、`assets-staging/`。
   调试用的临时文件用完就删，收尾时工作区必须是干净的。
3. **提交**：`git add -A` → 提交信息用中文写清「改了什么 + 为什么」，**一条提交只说一件事**。
   历史上大多是直接的中文动宾句（如「修正脚本与工具里工作区路径写法…」），需要时加
   `fix:` / `feat:` / `chore:` 前缀。
4. **先同步再推**：`git pull --rebase` → `git push`。远端常被每天热力图那条自动提交抢先。
5. **验证上线**：等 1~2 分钟，比线上 sitemap 与本地 `dist/sitemap-0.xml` 的页面数，新页面应能 200。
   构建失败去 Cloudflare 项目页看日志。

提交与推送是你这份工作的一部分，不是可选的「顺手帮忙」。做完要告诉用户：提交了什么、
线上是否已经更新（给出验证结果，不要只说「推好了」）。

## 二、两个已知的坑，别重复踩

- **pnpm 版本**：本地（DSH 内置）是 pnpm 11，**Cloudflare 构建镜像是 pnpm 9**。
  pnpm 9 要求 `pnpm-workspace.yaml` 里必须有 `packages` 字段，缺了会在安装阶段直接中止构建
  （`ERROR packages field missing or empty`），而本地 pnpm 11 不会报错 —— 所以**本地构建通过
  不能证明 CI 会通过**。改任何 pnpm 配置（`pnpm-workspace.yaml` / `.npmrc` / 锁文件）都要按
  pnpm 9 校验一遍。详见 README「构建环境的 pnpm 版本」。
- **不要往 `src/content/` 放临时文件**：glob loader 会把任何 `.md` 当成内容条目，缺字段直接让
  构建失败。中间产物一律放到 `src/` 之外。

## 三、动手前先读文档

- `README.md` 是这个仓库唯一的操作文档：站点结构、内容规范、部署流程、踩过的坑都在里面。
- 改某个行为之前，先读对应章节；改完如果行为变了，**顺手把 README 更新掉**（文档过期比没文档更坑）。
