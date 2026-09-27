"""PDF 후처리: 장 시작 페이지 찾기, 표지+본문 병합, 목차 북마크와 링크 추가 (pymupdf 필요)."""
import json
import sys

import pymupdf

MARKS = ["SUMMARY", "PART 01", "PART 02", "PART 03", "PART 04"]
TITLES = {"SUMMARY": "핵심 요약", "PART 01": "01 기출 분석", "PART 02": "02 모의논술",
          "PART 03": "03 채점 기준", "PART 04": "04 정시 분석"}
TOC_TEXT = {"SUMMARY": "핵심 요약", "PART 01": "기출 분석", "PART 02": "모의논술",
            "PART 03": "채점 기준", "PART 04": "정시 분석"}


def find_pages(path):
    doc, found = pymupdf.open(path), {}
    for i, page in enumerate(doc):
        text = page.get_text()
        for m in MARKS:
            if m not in found and m in text:
                found[m] = i + 1
    return found


def merge(cover, body, out, pages):
    doc = pymupdf.open(cover)
    offset = doc.page_count
    doc.insert_pdf(pymupdf.open(body))
    doc.set_toc([[1, TITLES[m], pages[m] + offset] for m in MARKS if m in pages])
    first = doc[0]
    width = first.rect.width
    for m in MARKS:
        if m not in pages:
            continue
        hits = first.search_for(TOC_TEXT[m])
        if hits:
            r = hits[-1]
            first.insert_link({"kind": pymupdf.LINK_GOTO, "page": pages[m] + offset - 1,
                               "from": pymupdf.Rect(40, r.y0 - 8, width - 40, r.y1 + 14)})
    doc.set_metadata({"title": "부산대 경영학과 입시 대비 자료", "subject": "인문논술 기출 분석 · 모의논술 · 채점 기준 · 정시 입결"})
    doc.save(out, garbage=3, deflate=True)


if __name__ == "__main__":
    if sys.argv[1] == "pages":
        print(json.dumps(find_pages(sys.argv[2])))
    else:
        merge(sys.argv[2], sys.argv[3], sys.argv[4], json.loads(sys.argv[5]))
