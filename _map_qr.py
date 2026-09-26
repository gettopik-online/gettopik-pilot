# Completes a book's audio-QR list. Many printed codes are too soft to decode, so every code-sized picture
# that sits on a section heading ("듣기 2", "말하기 1", "발음" ...) is matched by name to the publisher's
# YouTube playlist for that book ("1A SB 3단원 말하기 1"); decoded codes keep their own link.
# Usage: python _map_qr.py <teacher pdf> <key> <book code, e.g. 1A> <playlist id>
#   -> html_books/<key>/<key>.qr.json  and  html_books/<key>/<key>.playlist.json
import sys, json, re, subprocess
import pymupdf

pdf, key, book, plid = sys.argv[1:5]
base = f"html_books/{key}/{key}"
PAGES = json.load(open(base + ".pages.json", encoding="utf-8"))
decoded = {(q["page"], round(q["x"]), round(q["y"])): q for q in json.load(open(base + ".qr.json", encoding="utf-8"))}

# --- playlist: every video id and title
html = subprocess.run(["curl", "-s", "-A", "Mozilla/5.0", "-H", "Accept-Language: ko",
                       f"https://www.youtube.com/playlist?list={plid}"], capture_output=True).stdout.decode("utf-8")
data = json.loads(re.search(r"var ytInitialData = (\{.*?\});</script>", html).group(1))
videos = []
def walk(o):
    if isinstance(o, dict):
        if "playlistVideoRenderer" in o:
            v = o["playlistVideoRenderer"]
            videos.append((v["videoId"], "".join(r["text"] for r in v["title"]["runs"])))
        elif "lockupViewModel" in o and o["lockupViewModel"].get("contentType") == "LOCKUP_CONTENT_TYPE_VIDEO":
            v = o["lockupViewModel"]            # newer page layout
            videos.append((v["contentId"], v["metadata"]["lockupMetadataViewModel"]["title"]["content"]))
        for x in o.values():
            walk(x)
    elif isinstance(o, list):
        for x in o:
            walk(x)
walk(data)
json.dump(videos, open(base + ".playlist.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)

def norm(t):
    t = re.sub(r"\s*수정\s*\d*", "", t)
    t = re.sub(r"(\D)0+(\d)", r"\1\2", t)
    return re.sub(r"\s+", "", t)
by_title = {}
for vid, t in videos:                    # a later "수정" (corrected) upload wins over the first one
    k = norm(t)
    if k not in by_title or "수정" in t:
        by_title[k] = vid
title_of = {vid: t for vid, t in videos}

SECTION = re.compile(r"^\s*(듣기\s*\d|말하기\s*\d|읽기\s*\d|쓰기\s*\d|발음)\s*$")
def unit_of(pno):
    for p in range(pno, 0, -1):                           # pages without a lesson header belong to the one before
        for r in PAGES[p - 1]["runs"]:
            m = re.fullmatch(r"\s*(\d{1,2})-[12]\s*", r["t"])
            if m and r["y"] < 90:
                return int(m.group(1))
def label(pno, x, y):
    near = [r for r in PAGES[pno - 1]["runs"]
            if abs(r["y"] - y) < 16 and x - 470 < r["x"] < x and SECTION.match(r["t"])]
    if not near:                                          # 발음 boxes print the code under their label
        near = [r for r in PAGES[pno - 1]["runs"]
                if 0 < y - r["y"] < 42 and abs(r["x"] - x) < 20 and r["t"].strip() == "발음"]
    if not near:
        return None
    numbered = [r for r in near if re.search(r"\d", r["t"])]   # a small "발음" tip inside a 말하기 card loses
    return re.sub(r"\s+", " ", max(numbered or near, key=lambda r: r["x"])["t"].strip())

doc = pymupdf.open(pdf)
out, problems = [], []
for page in doc:
    pno = page.number + 1
    seen = set()
    for info in page.get_image_info(xrefs=True):
        x0, y0, x1, y1 = info["bbox"]
        w, h = x1 - x0, y1 - y0
        k = (pno, round(x0), round(y0))
        if k in seen or not (20 <= w <= 44 and 20 <= h <= 44 and 0.75 <= w / h <= 1.33):
            continue
        lab = label(pno, x0, y0)
        dec = decoded.get(k)
        if not lab and not dec:
            continue                                          # an illustration, not an audio code
        seen.add(k)
        unit = unit_of(pno)
        want = norm(f"{book} SB {unit}단원 {lab}") if lab and unit else None
        yt = dec["yt"] if dec else by_title.get(want)
        if dec and want and by_title.get(want) and by_title[want] != dec["yt"]:
            problems.append(f"p{pno} {lab}: QR {title_of.get(dec['yt'], dec['yt'])} / nom bo'yicha {want}")
        if not yt:
            problems.append(f"p{pno} {lab or '?'} (unit {unit}): playlistda topilmadi")
            continue
        out.append({"page": pno, "x": round(x0, 1), "y": round(y0, 1), "w": round(w, 1), "h": round(h, 1),
                    "yt": yt, "title": title_of.get(yt, ""), "how": "qr" if dec else "nom"})
out.sort(key=lambda q: (q["page"], q["x"] > 297, q["y"]))
json.dump(out, open(base + ".qr.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
used = {q["yt"] for q in out}
from collections import Counter
for vid, n in Counter(q["yt"] for q in out).items():
    if n > 1:
        problems.append(f"{title_of.get(vid, vid)} {n} marta: " + ", ".join(f"p{q['page']}" for q in out if q["yt"] == vid))
print(f"{key}: {len(out)} ta QR ({sum(q['how'] == 'qr' for q in out)} o'qildi, {sum(q['how'] == 'nom' for q in out)} nom bo'yicha), "
      f"playlistda {len(videos)} ta video, kitobda ishlatilmagani {len([v for v, _ in videos if v not in used])}")
for p in problems:
    print("  !", p)
