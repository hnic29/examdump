#!/usr/bin/env python3
"""Scrape CY0-001 braindumps (pages 2-15), cross-verify answers, emit JSON."""
import json, re, sys, time, urllib.request
from bs4 import BeautifulSoup

BASE = "https://free-braindumps.com/comptia/free-cy0-001-braindumps/page-{}"
PAGES = range(2, 16)  # page-2 .. page-15  => 14 pages
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
LETTERS = "ABCDEFGHIJ"

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")

def clean(node):
    # text with <br> turned into newlines, collapsed whitespace per line
    for br in node.find_all("br"):
        br.replace_with("\n")
    txt = node.get_text()
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in txt.split("\n")]
    return "\n".join([ln for ln in lines if ln != ""]).strip()

def parse_page(html, page_no):
    soup = BeautifulSoup(html, "lxml")
    # Only the accordion of real exam questions
    group = soup.find("div", id="accordion")
    questions = []
    if not group:
        return questions
    for panel in group.find_all("div", class_="panel", recursive=False):
        head = panel.find("strong", class_="text-uppercase")
        if not head or "QUESTION" not in head.get_text().upper():
            continue
        qnum = head.get_text(strip=True)  # e.g. "QUESTION: 1"
        lead = panel.find("p", class_="lead")
        qtext = clean(lead) if lead else ""
        ol = panel.find("ol")
        opts = []
        correct_from_attr = []
        if ol:
            for i, li in enumerate(ol.find_all("li")):
                letter = LETTERS[i]
                opts.append({"letter": letter, "text": clean(li)})
                dc = (li.get("data-correct") or "").strip().lower()
                if dc == "true":
                    correct_from_attr.append(letter)
        # Answer(s): text in the hidden answer div
        ansdiv = panel.find("div", id=re.compile(r"^answerQ"))
        correct_from_text = []
        explanation = ""
        if ansdiv:
            full = ansdiv.get_text(" ", strip=True)
            m = re.search(r"Answer\(s\):\s*([A-J](?:\s*,\s*[A-J])*)", full)
            if m:
                correct_from_text = [c.strip() for c in m.group(1).split(",")]
            exp = ansdiv.find("div", class_="bg-light-yellow")
            if exp:
                explanation = clean(exp)
                explanation = re.sub(r"^Explanation:\s*", "", explanation).strip()
        match = sorted(correct_from_attr) == sorted(correct_from_text)
        questions.append({
            "page": page_no,
            "qnum": qnum,
            "question": qtext,
            "options": opts,
            "correct_attr": correct_from_attr,
            "correct_text": correct_from_text,
            "verified": match,
            "explanation": explanation,
        })
    return questions

def main():
    all_q = []
    for p in PAGES:
        url = BASE.format(p)
        sys.stderr.write(f"Fetching page {p} ...\n"); sys.stderr.flush()
        html = fetch(url)
        qs = parse_page(html, p)
        sys.stderr.write(f"  page {p}: {len(qs)} questions\n")
        all_q.extend(qs)
        time.sleep(1.0)
    out = "C:/Users/BettyBlu/Documents/~Projects/ExamDump/_questions.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(all_q, f, ensure_ascii=False, indent=2)

    # Verification report
    total = len(all_q)
    mismatches = [q for q in all_q if not q["verified"]]
    no_answer = [q for q in all_q if not q["correct_attr"] and not q["correct_text"]]
    sys.stderr.write("\n===== VERIFICATION =====\n")
    sys.stderr.write(f"Total questions: {total}\n")
    sys.stderr.write(f"Answer source agreement (attr == text): {total - len(mismatches)}/{total}\n")
    if mismatches:
        sys.stderr.write(f"MISMATCHES ({len(mismatches)}):\n")
        for q in mismatches:
            sys.stderr.write(f"  p{q['page']} {q['qnum']}: attr={q['correct_attr']} text={q['correct_text']}\n")
    if no_answer:
        sys.stderr.write(f"NO ANSWER FOUND ({len(no_answer)}):\n")
        for q in no_answer:
            sys.stderr.write(f"  p{q['page']} {q['qnum']}\n")
    sys.stderr.write(f"\nWrote {out}\n")

if __name__ == "__main__":
    main()
