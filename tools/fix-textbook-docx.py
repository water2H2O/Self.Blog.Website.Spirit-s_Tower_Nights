#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""修《T6 魔法指令集导论》docx 的标题层级与分页（正文一个字不动）。

要修的问题（原文生成脚本留下的）：
  · 序篇的「一、…七、」是 Heading 3（且「七、」漏了样式）—— 应该是序篇下面一级
  · **第 1–4 章与两处卷标记完全没标题样式**（Normal）—— Word 导航窗格与自动目录都认不出
  · 5.1 / 10.3 这类小节是 Heading 4，却直接挂在 Heading 1 的章下面 —— 跳级
  · 「学习目标 / 申明示例 / 常见错误 / 练习 / 本课小结」混用 Heading 3 / Heading 4 / Normal
  · 全书结语、下一步用了 Heading 1 / Heading 2 —— 与前文体例不一致
  · 多数卷与章没有分页符，章从页中开始

修法（统一成三级）：
  第 1 级 = 卷标记 / 序篇 / 全书结语 / 附录    → Heading 1
  第 2 级 = 第 N 章                            → Heading 2
  第 3 级 = N.N 小节 / 序篇的「一、…」/ 章内栏目（学习目标…）/ 附录小节 → Heading 3

另外：卷与章一律另起一页（已经有的不重复插）。

安全措施：**只改样式，不改文字**；改前把正文段落样式全部记下来，
保存前逐段复查，任何一段文字变了就中止不落盘。

用法：
    python tools/fix-textbook-docx.py <书.docx> [--dry-run]
"""
import argparse
import os
import re
import shutil
import sys

from docx import Document
from docx.enum.text import WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt
from docx.table import Table
from docx.text.paragraph import Paragraph

sys.stdout.reconfigure(encoding="utf-8")

FONT_EA = "微软雅黑"

FULL = "\u3000"  # 全角空格

VOL_RE = re.compile(r"^第[一二三四五六七八九十]+卷(?:" + FULL + r"|\s)")
CH_RE = re.compile(r"^第[一二三四五六七八九十]+章(?:" + FULL + r"|\s)")
# 小节号：必须是「8.3　标题」这种写法 —— 后面紧跟全角空格，
# 且标题里不含句读。正文里也有「8.3 那三次记录，已经并排抄在本子上了；」这种回指，
# 只认「N.N」会把它们误判成标题。
SEC_RE = re.compile(r"^\d+\.\d+" + FULL + r"[^。；！？，、：]")
CN_RE = re.compile(r"^[一二三四五六七八九十]+、")
APPENDIX_RE = re.compile(r"^附录\s*[A-ZＡ-Ｚ]?(?:" + FULL + r"|\s|$)")
COLUMN_HEADS = {"学习目标", "申明示例", "常见错误", "练习", "本课小结"}


def blocks(doc):
    for child in doc.element.body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, doc)
        elif child.tag == qn("w:tbl"):
            yield Table(child, doc)


def text_of(paragraph: Paragraph) -> str:
    return "".join(run.text or "" for run in paragraph.runs).strip()


def has_page_break(paragraph: Paragraph) -> bool:
    return 'w:type="page"' in paragraph._element.xml


def set_style(paragraph: Paragraph, style: str) -> bool:
    """设段落样式；本来就是这个样式就返回 False（没改动）。"""
    if paragraph.style.name == style:
        return False
    paragraph.style = style
    return True


# 标题字号（磅）。样式表里的 heading 1/2/3 是 17/13.5/11.5pt，这里给相近的值。
HEADING_SIZE = {1: 16, 2: 14, 3: 11.5}


def set_explicit_font(paragraph: Paragraph, level: int) -> bool:
    """给标题补上**直接字体与字号**，覆盖样式里继承的主题字体。

    为什么必须做：样式表里的 heading 用的是 `majorHAnsi` / `majorEastAsia`
    这类**主题字体**。只套样式时，LibreOffice 导出 PDF 会把中文标题的字序打乱，
    提取出来是「第一卷　 ：法 、魔力与施法者总论 则」这种样子 ——
    于是量页码的脚本按行首找不到标题，目录里那几行页码就只能留空。
    补上直接字体（微软雅黑）与字号之后，提取恢复正常。
    """
    changed = False
    for run in paragraph.runs:
        if run.font.name != FONT_EA:
            run.font.name = FONT_EA
            changed = True
        rpr = run._element.get_or_add_rPr()
        fonts = rpr.find(qn("w:rFonts"))
        if fonts is None:
            fonts = OxmlElement("w:rFonts")
            rpr.insert(0, fonts)
        for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
            if fonts.get(qn(attr)) != FONT_EA:
                fonts.set(qn(attr), FONT_EA)
                changed = True
        target = Pt(HEADING_SIZE.get(level, 11.5))
        if run.font.size != target:
            run.font.size = target
            changed = True
    return changed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("docx")
    parser.add_argument("--dry-run", action="store_true", help="只报告要改什么，不写文件")
    args = parser.parse_args()

    path = args.docx
    if not os.path.exists(path):
        print(f"文件不存在：{path}", file=sys.stderr)
        return 1

    doc = Document(path)
    all_blocks = list(blocks(doc))

    # 正文起点：最后一个「序篇　编者的话」（前面目录表里也有同名的条目）
    body_start = None
    for index, block in enumerate(all_blocks):
        if isinstance(block, Paragraph) and text_of(block) == f"序篇{FULL}编者的话":
            body_start = index
    if body_start is None:
        print("找不到正文起点「序篇　编者的话」", file=sys.stderr)
        return 1

    # 样式统计与改动清单
    changes = []
    page_breaks_added = []
    current_chapter_index = None

    for index in range(body_start, len(all_blocks)):
        block = all_blocks[index]
        if not isinstance(block, Paragraph):
            continue
        text = text_of(block)
        if not text:
            continue

        # ---- 先判级别 ----
        level = None
        level_name = ""
        if VOL_RE.match(text) or text.startswith("序篇") or text.startswith("全书结语"):
            level, level_name = 1, "卷/序篇/结语"
        elif APPENDIX_RE.match(text):
            level, level_name = 1, "附录"
        elif CH_RE.match(text):
            level, level_name = 2, "章"
        elif SEC_RE.match(text) or text in COLUMN_HEADS:
            level, level_name = 3, "小节/栏目"
        elif CN_RE.match(text) and not any(p in text for p in "。；！？，、："):
            # 序篇的「一、给读这本书的第一个人」这类。
            # 正文里也有「一、魔力和元素粒子不是一回事。 元素粒子是对象……」这种编号论断，
            # 判据是它带句读、或本行就写得很长 —— 小节标题两样都不占。
            level, level_name = 3, "中文小节"
        elif text.startswith("下一步"):
            level, level_name = 3, "小节/栏目"

        if level is None:
            continue

        target = f"Heading {level}"
        styled = set_style(block, target)
        fonte = set_explicit_font(block, level)
        if styled or fonte:
            changes.append((index, level_name, text[:44], target))

        if level == 2:
            current_chapter_index = index

    # ---- 卷与章另起一页 ----
    for index in range(body_start, len(all_blocks)):
        block = all_blocks[index]
        if not isinstance(block, Paragraph):
            continue
        text = text_of(block)
        if not text:
            continue
        # 序篇、卷、章、全书结语、附录都要新起一页（第一个除外）
        needs_break = bool(
            VOL_RE.match(text)
            or CH_RE.match(text)
            or text.startswith("全书结语")
            or APPENDIX_RE.match(text)
        )
        if not needs_break:
            continue
        # 已经有分页符（本段内，或紧邻前面那个空段里）就不重复插
        if has_page_break(block):
            continue
        prev = all_blocks[index - 1] if index > 0 else None
        if isinstance(prev, Paragraph) and has_page_break(prev):
            continue
        if args.dry_run:
            page_breaks_added.append((index, text[:40]))
            continue
        # 另起一个空段，**分页符单独成一个 run**。
        # 千万别把分页符加进标题自己的 run 里 —— 那样标题会被拉到上一页的末尾，
        # 与正文挤在一起，量页码时按行首找标题就找不到了（上一版就是这么坏掉的）。
        holder = block.insert_paragraph_before()
        holder.add_run().add_break(WD_BREAK.PAGE)
        page_breaks_added.append((index, text[:40]))

    print(f"正文起点：块 {body_start}")
    print(f"\n样式改动 {len(changes)} 处：")
    for index, kind, text, target in changes:
        print(f"  块{index:4d} [{kind:8s}] → {target:9s} {text}")
    print(f"\n新增分页 {len(page_breaks_added)} 处：")
    for index, text in page_breaks_added:
        print(f"  块{index:4d} {text}")

    if args.dry_run:
        print("\n（dry-run，没有写文件）")
        return 0

    # ---- 落盘前复查：正文一个字都不能变 ----
    backup = path + ".bak"
    shutil.copy2(path, backup)
    doc.save(path)

    after = Document(path)
    before_texts = [
        text_of(b) for b in all_blocks if isinstance(b, Paragraph) and text_of(b)
    ]
    after_paras = [b for b in blocks(after) if isinstance(b, Paragraph) and text_of(b)]
    after_texts = [text_of(b) for b in after_paras]
    if before_texts != after_texts:
        shutil.copy2(backup, path)
        print("\n复查失败：正文被改动了，已回滚。", file=sys.stderr)
        # 找出第一处不同
        for i, (a, b) in enumerate(zip(before_texts, after_texts)):
            if a != b:
                print(f"  第一处不同（第 {i} 段）：\n    改前 {a[:60]!r}\n    改后 {b[:60]!r}", file=sys.stderr)
                break
        return 2

    print(f"\n已写入 {path}（备份 {os.path.basename(backup)}）")
    print(f"复查通过：{len(after_texts)} 段正文逐段一致")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
