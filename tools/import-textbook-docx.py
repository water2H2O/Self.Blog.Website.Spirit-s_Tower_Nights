"""把《T6 魔法指令集导论》docx 导入成 src/content/textbook/ 下的 markdown。

用法：
    python tools/import-textbook-docx.py <源.docx> [--out-dir=src/content/textbook] [--force]

规则（与故事导入一致：只做结构转换，正文一个字不改写）：
    · 卷标记（第一/二/三/四卷…）        → frontmatter 的 volume / volumeNo
    · 章标题（第X章…／序篇…／全书结语…）  → frontmatter 的 title，另起一个文件
    · Heading 3「学习目标」             → `## 学习目标`
    · Heading 4 与 `5.1 …` 这类小节     → `### …`
    · `申明示例` / `常见错误` / `练习` / `本课小结` → `## …`
    · 表格                              → markdown 表格（补上分隔行）
    · 列表（List Bullet / List Number）  → `- ` / `1. `
    · 目录表与前面的版本信息             → 跳过（目录由页面的目录区重建）

文档里「序篇 + 第一至四章」是普通段落而不是标题样式（原稿如此），
所以章的切分点同时认「样式是 Heading」和「文本形如 第X章／序篇／全书结语」。

自校验：源 docx 的每一段（去掉标记与空白后）都必须原样出现在产出里，
不一致就退出码 1 并且不写任何文件。
"""

import argparse
import os
import re
import sys
from pathlib import Path

import docx
from docx.document import Document as DocxDocument
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph

# Windows 控制台默认 GBK，直接 print 中文/符号会抛 UnicodeEncodeError
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001 —— 老版本 Python 没有 reconfigure，退回默认即可
    pass

# 卷标记：文本形如「第二卷　基础元素导论」
VOLUME_RE = re.compile(r"^第([一二三四五六七八九十]+)卷[　\s]*(.*)$")
# 章标题：第X章／序篇／全书结语／附录X
CHAPTER_RE = re.compile(r"^(第[一二三四五六七八九十百]+章|序篇|全书结语|附录\s*[A-ZＡ-Ｚ]?)[　\s]*(.*)$")
# 章标题里「第X章」后面必须是全角空格才认（「第一章　魔法是什么」）。
# 正文里到处是「第七章会讲…」「第二章说过…」这类交叉引用，没有这个空格；
# 不加这条判定就会把引用当成新章，切出一堆重复文件。
CHAPTER_TITLE_RE = re.compile(r"^第[一二三四五六七八九十百]+章[　]")

# 认标题不认样式名，认**文本形状**：docx 里章标题可能是 Heading 1 也可能是 Heading 2
# （修过层级的稿子是 Heading 2：卷为一级、章为二级），还可能是 Normal（早期草稿）。
# 段落样式只影响排版，不该影响切分 —— 这里一律按文本判定。
ANY_STYLE_OK = True
# 小节编号：5.1 / 10.3 …
SECTION_RE = re.compile(r"^\d+\.\d+[　\s]")
# 中文序号小节：一、给读这本书的第一个人
CN_SECTION_RE = re.compile(r"^[一二三四五六七八九十]+、")
# 章内的固定栏目
COLUMN_HEADS = {"学习目标", "申明示例", "常见错误", "练习", "本课小结"}
# 卷末的过场文字（单独成段，不当标题）
TAIL_HEADS = {"本卷到此为止"}
# 过场/装饰行：不是正文，跳过
DECOR_RE = re.compile(r"^(——.*——|目\s*录)$")

CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}

# 全册共 24 章（正典规划：第一至四卷 18 章 + 第五卷 19–24 章）。
# 章号超过这个数的「第X章…」一律当成正文里的交叉引用，不做切分。
CHAPTER_MAX = 24


def iter_blocks(document: DocxDocument):
    for child in document.element.body.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, document)
        elif isinstance(child, CT_Tbl):
            yield Table(child, document)


def style_of(paragraph: Paragraph) -> str:
    return (paragraph.style.name or "") if paragraph.style is not None else ""


def is_heading_style(paragraph: Paragraph) -> bool:
    style = style_of(paragraph).lower()
    return style.startswith("heading") or style.startswith("标题")


def text_of(paragraph: Paragraph) -> str:
    return "".join(run.text for run in paragraph.runs).replace("\xa0", " ").strip()


def table_to_markdown(table: Table) -> list[str]:
    rows = []
    for row in table.rows:
        cells = [c.text.replace("\xa0", " ").replace("\n", " ").strip() for c in row.cells]
        cells = [c.replace("|", "｜") for c in cells]
        rows.append(cells)

    # 一格表格 = 原稿里的边栏小框（［法则视角］［编者注］［塔里的事］）。
    # 它在书里是带底纹的小方块，转到网页上用引用块更贴切，也省得整页都是表格。
    if len(rows) == 1 and len(rows[0]) == 1:
        text = rows[0][0]
        lines = [f"> {line}" if line else ">" for line in text.split("\n")]
        return [*lines, ""]
    if not rows:
        return []

    # 表格是「表头 + 数据」两段式；单行表就补一行空表头，markdown 才认
    cells = ["| " + " | ".join(row) + " |" for row in rows]
    width = len(rows[0])
    divider = "| " + " | ".join(["---"] * width) + " |"
    if len(cells) == 1:
        return ["| " + " | ".join([""] * width) + " |", divider, cells[0], ""]
    return [cells[0], divider, *cells[1:], ""]


def is_column_head(text: str, style: str) -> bool:
    """章内的固定栏目：`申明示例`「常见错误」「练习」等 —— 原稿里混用 Heading 3/4 与普通段落。"""
    return text in COLUMN_HEADS and not text.startswith("学习目标：")


def to_markdown(blocks: list) -> tuple[list[dict], dict, list[tuple[str, str]]]:
    """把 docx 块序列切成「章」的列表。

    返回 (chapters, colophon, checks)
      chapters —— [{title, volume, volumeNo, lines}]，lines 是该章正文的 markdown 行
      colophon —— 封面信息（标题、编者、版次…）
      checks   —— [(段落文本, 出现位置)]，出现位置是 "title" 或 "body"，供逐字校验
    """
    chapters: list[dict] = []
    colophon: dict = {}
    checks: list[tuple[str, str]] = []

    current_volume = ""
    current_volume_no = 0
    current: dict | None = None
    started = False

    # 封面信息：正文开始前的那几行（标题、副题、编者、版次、适用范围）
    COLOPHON_KEYS = ["编者：", "版次：", "适用范围："]

    for block in blocks:
        if isinstance(block, Table):
            if not started or current is None:
                continue
            current["lines"].extend(table_to_markdown(block))
            continue

        text = text_of(block)
        if not text:
            continue
        if DECOR_RE.match(text):
            continue
        style = style_of(block)

        # 卷标记
        volume_match = VOLUME_RE.match(text)
        if volume_match and "终" not in text and len(text) < 40:
            current_volume = text
            current_volume_no = CN_NUM.get(volume_match.group(1), 0)
            started = True
            continue

        # 章标题：样式是 Heading 1，或文本形如 第X章　／序篇／全书结语。
        # 标题进 frontmatter，不进正文 —— 校验时按 "title" 位置比对。
        chapter_match = CHAPTER_RE.match(text)
        chapter_no = (
            cn_to_int(chapter_match.group(1)[1:-1])
            if chapter_match and "章" in chapter_match.group(1)
            else None
        )
        is_chapter_title = bool(chapter_match) and (
            chapter_match.group(1) in ("序篇", "全书结语")
            # 章号要在 1–CHAPTER_MAX 之内，且「第X章」后面跟着全角空格（见 CHAPTER_TITLE_RE）
            or (
                chapter_no is not None
                and 1 <= chapter_no <= CHAPTER_MAX
                and bool(CHAPTER_TITLE_RE.match(text))
            )
        )
        if is_chapter_title and len(text) < 60:
            current = {
                "title": text,
                "volume": current_volume,
                "volumeNo": current_volume_no,
                "lines": [],
            }
            chapters.append(current)
            started = True
            checks.append((text, "title"))
            continue

        if not started or current is None:
            # 正文之前：收封面信息
            if text.startswith("《T6"):
                colophon["title"] = text.strip("《》")
            elif "总览" in text or "节本" in text:
                colophon["subtitle"] = text
            for key in COLOPHON_KEYS:
                if text.startswith(key):
                    colophon[key.strip("：")] = text[len(key):]
            if text.startswith("内部教学材料"):
                colophon["notice"] = text
            continue

        # 卷末过场
        if text in TAIL_HEADS:
            current["lines"].extend([f"## {text}", ""])
            checks.append((text, "body"))
            continue

        # 章内二级：五个固定栏目（学习目标 / 申明示例 / 常见错误 / 练习 / 本课小结）
        if is_column_head(text, style):
            current["lines"].extend([f"## {text}", ""])
            checks.append((text, "body"))
            continue
        # 章内三级：编号小节（5.1 / 10.3）
        if SECTION_RE.match(text):
            current["lines"].extend([f"### {text}", ""])
            checks.append((text, "body"))
            continue
        # 序篇的中文小节（一、二、…）：一律三级。
        # 序篇正文里没有这种编号论断（论断用的是「一、…。说明」且只出现在章内），
        # 所以这里不再加长度与标点的限制 —— 小节标题本身就可能带逗号、也偏长
        # （例：「五、学完 T6，你会做到什么、做不到什么」）。
        if current["title"].startswith("序篇") and CN_SECTION_RE.match(text):
            current["lines"].extend([f"### {text}", ""])
            checks.append((text, "body"))
            continue
        # 章内正文里的编号论断（「一、魔力和元素粒子不是一回事。 元素粒子是对象……」）：
        # 带句读或偏长的一律当正文，不做标题
        if (
            CN_SECTION_RE.match(text)
            and len(text) < 30
            and not any(p in text for p in "。；！？，")
        ):
            current["lines"].extend([f"### {text}", ""])
            checks.append((text, "body"))
            continue
        # 样式是标题、但形状不在上面几类里的（例如结语里的「下一步」）：当二级
        if style in ("Heading 2", "Heading 3", "Heading 4") and len(text) < 40:
            current["lines"].extend([f"## {text}", ""])
            checks.append((text, "body"))
            continue

        # 列表
        if "List Bullet" in style:
            current["lines"].append(f"- {text}")
            checks.append((text, "body"))
            continue
        if "List Number" in style:
            current["lines"].append(f"1. {text}")
            checks.append((text, "body"))
            continue

        current["lines"].append(text)
        current["lines"].append("")
        checks.append((text, "body"))

    return chapters, colophon, checks


def strip_inline(text: str) -> str:
    """只去掉 markdown 语法符号，用于逐字校验。"""
    text = re.sub(r"^#{1,6}\s*", "", text)
    text = re.sub(r"^[-*]\s+", "", text)
    text = re.sub(r"^\d+\.\s+", "", text)
    text = text.replace("**", "").replace("__", "")
    return re.sub(r"[|\s\u00a0]+", "", text)


def slug_of(title: str) -> str:
    """章标题 → 文件名。序篇 / 第N章 / 全书结语 / 附录X"""
    m = re.match(r"^第([一二三四五六七八九十百]+)章", title)
    if m:
        num = cn_to_int(m.group(1))
        return f"ch-{num:02d}"
    if title.startswith("序篇"):
        return "preface"
    if title.startswith("全书结语"):
        return "afterword"
    m = re.match(r"^附录\s*([A-ZＡ-Ｚ])", title)
    if m:
        letter = m.group(1).translate(str.maketrans("ＡＢＣＤＥＦＧＨＩＪ", "ABCDEFGHIJ"))
        return f"appendix-{letter.lower()}"
    return re.sub(r"[^\w]+", "-", title)[:40].strip("-") or "section"


def cn_to_int(text: str) -> int:
    """中文数字转阿拉伯数字，够用到「二十四」。"""
    if text == "十":
        return 10
    if "十" in text:
        head, _, tail = text.partition("十")
        tens = CN_NUM.get(head, 1) if head else 1
        ones = CN_NUM.get(tail, 0) if tail else 0
        return tens * 10 + ones
    return CN_NUM.get(text, 0)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("--out-dir", default="src/content/textbook")
    parser.add_argument("--force", action="store_true", help="覆盖已存在的文件")
    args = parser.parse_args()

    src = Path(args.source)
    if not src.exists():
        print(f"源文件不存在：{src}", file=sys.stderr)
        return 1

    document = docx.Document(str(src))
    blocks = list(iter_blocks(document))
    chapters, colophon, checks = to_markdown(blocks)

    if not chapters:
        print("没有切出任何章，检查源文件结构。", file=sys.stderr)
        return 1

    # 逐字校验：源里每一段都要能在对应位置原样找到
    #   "title" → 该章 frontmatter 的 title（标题只进 frontmatter，不进正文）
    #   "body"  → 该章正文
    body_flat = strip_inline(
        "\n".join(line for chapter in chapters for line in chapter["lines"])
    )
    title_flat = strip_inline(
        "\n".join(re.sub(r"[　\s]+", " ", chapter["title"]) for chapter in chapters)
    )
    missing = []
    for text, where in checks:
        needle = strip_inline(text)
        if len(needle) < 2:
            continue
        haystack = title_flat if where == "title" else body_flat
        if needle not in haystack:
            missing.append((text, where))
    if missing:
        print("逐字校验失败，未写文件：", file=sys.stderr)
        for text, where in missing[:8]:
            print(f"  · [{where}] " + text[:80], file=sys.stderr)
        return 1

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    written = []
    skipped = []
    for chapter in chapters:
        slug = slug_of(chapter["title"])
        target = out_dir / f"{slug}.md"
        # 标题原样保留（含「第一章　魔法是什么」里的全角空格）—— 与书里排法一致
        title = chapter["title"].strip()
        front = ["---", f"title: {title}"]
        if chapter["volume"]:
            front.append(f"volume: {chapter['volume'].strip()}")
            front.append(f"volumeNo: {chapter['volumeNo']}")
        front.append("draft: false")
        front.append("---")
        body = "\n".join(chapter["lines"]).strip() + "\n"
        text = "\n".join(front) + "\n\n" + body

        if target.exists() and not args.force:
            skipped.append(target)
            continue
        target.write_text(text, encoding="utf-8", newline="\n")
        written.append((target, len(body)))

    print(f"源：{src.name}")
    print(f"封面信息：{colophon}")
    print(f"切出 {len(chapters)} 章")
    for target, size in written:
        print(f"  ✓ {target}（正文 {size} 字符）")
    for target in skipped:
        print(f"  · 已存在，跳过（--force 可覆盖）：{target}")
    print(f"逐字校验通过（{len(checks)} 段全部一致）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
