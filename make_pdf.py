#!/usr/bin/env python3
"""Render the verified CY0-001 questions into a clean PDF."""
import json
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, HRFlowable,
                                Table, TableStyle, PageBreak, KeepTogether)
from xml.sax.saxutils import escape

SRC = "C:/Users/BettyBlu/Documents/~Projects/ExamDump/_questions.json"
OUT = "C:/Users/BettyBlu/Documents/~Projects/ExamDump/CY0-001_Questions_and_Answers.pdf"

data = json.load(open(SRC, encoding="utf-8"))

ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=ss["Title"], fontSize=22, spaceAfter=6)
SUB = ParagraphStyle("SUB", parent=ss["Normal"], fontSize=10.5, alignment=TA_CENTER,
                     textColor=colors.HexColor("#555555"), spaceAfter=2, leading=15)
QNUM = ParagraphStyle("QNUM", parent=ss["Normal"], fontSize=11.5, leading=16,
                      textColor=colors.HexColor("#1a3e72"), spaceBefore=2, spaceAfter=4,
                      fontName="Helvetica-Bold")
QTEXT = ParagraphStyle("QTEXT", parent=ss["Normal"], fontSize=11, leading=15, spaceAfter=6)
OPT = ParagraphStyle("OPT", parent=ss["Normal"], fontSize=10.5, leading=15,
                     leftIndent=14, spaceAfter=1)
OPTC = ParagraphStyle("OPTC", parent=OPT, textColor=colors.HexColor("#0a6b2e"),
                      fontName="Helvetica-Bold")
ANS = ParagraphStyle("ANS", parent=ss["Normal"], fontSize=10.5, leading=15,
                     textColor=colors.HexColor("#0a6b2e"), fontName="Helvetica-Bold",
                     spaceBefore=4)
EXPL = ParagraphStyle("EXPL", parent=ss["Normal"], fontSize=9.5, leading=13,
                      textColor=colors.HexColor("#444444"), leftIndent=8,
                      spaceBefore=2, spaceAfter=2)
EXPLH = ParagraphStyle("EXPLH", parent=EXPL, fontName="Helvetica-Bold",
                       textColor=colors.HexColor("#7a5c00"), spaceBefore=4)

def P(text, style):
    # Escaping helper for scraped/untrusted text
    return Paragraph(escape(text).replace("\n", "<br/>"), style)

def R(markup, style):
    # Raw helper for fully-controlled markup (static strings / integers only)
    return Paragraph(markup, style)

story = []
# ---- Title block ----
story.append(R("CompTIA CY0-001", H1))
story.append(R("AI Security+ &mdash; Practice Questions &amp; Verified Answers", SUB))
story.append(Spacer(1, 6))
story.append(R(f"{len(data)} questions &bull; scraped from free-braindumps.com (pages 2&ndash;7)", SUB))
story.append(R("Generated 2026-06-07 &bull; Every answer cross-verified from two independent "
               "sources in the page (the marked option and the stated Answer key).", SUB))
story.append(Spacer(1, 10))
story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#cccccc")))
story.append(Spacer(1, 8))

for i, q in enumerate(data, 1):
    block = []
    src = f"(source: page {q['page']})"
    block.append(R(f"Question {i} &nbsp;&nbsp;<font size=8 color='#999999'>{src}</font>", QNUM))
    block.append(P(q["question"], QTEXT))
    correct = set(q["correct_attr"])
    for o in q["options"]:
        mark = "    [Correct]" if o["letter"] in correct else ""
        style = OPTC if o["letter"] in correct else OPT
        block.append(P(f"{o['letter']}.  {o['text']}{mark}", style))
    ans = ", ".join(q["correct_attr"])
    block.append(P(f"Correct Answer: {ans}", ANS))
    if q["explanation"]:
        block.append(P("Explanation", EXPLH))
        block.append(P(q["explanation"], EXPL))
    block.append(Spacer(1, 6))
    block.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e0e0e0")))
    block.append(Spacer(1, 8))
    # Keep question + options together where possible; allow break before explanation
    story.append(KeepTogether(block[:2 + len(q["options"]) + 1]))
    for fl in block[2 + len(q["options"]) + 1:]:
        story.append(fl)

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#999999"))
    canvas.drawCentredString(letter[0] / 2, 0.5 * inch, f"CY0-001 Practice Q&A  —  Page {doc.page}")
    canvas.restoreState()

doc = SimpleDocTemplate(OUT, pagesize=letter,
                        leftMargin=0.85 * inch, rightMargin=0.85 * inch,
                        topMargin=0.8 * inch, bottomMargin=0.8 * inch,
                        title="CompTIA CY0-001 Practice Questions and Answers")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("Wrote", OUT)
