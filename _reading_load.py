# How much a learner has to read and answer in each 읽기 section of a 서울대 book, and a working time from that.
# A section is the card that starts at its blue item number; the passage is the body text inside it, the questions
# are the numbered/options lines. Prints a table and writes html_books/<key>/<key>.reading.json.
# Usage: python _reading_load.py <key> [syllables per minute, default 70] [seconds per answer, default 20]
import sys, json, re, math

key = sys.argv[1]
SPM = float(sys.argv[2]) if len(sys.argv) > 2 else 70.0      # silent reading speed of a 1st-level learner
SPA = float(sys.argv[3]) if len(sys.argv) > 3 else 20.0      # thinking + marking one answer
P = json.load(open(f"html_books/{key}/{key}.pages.json", encoding="utf-8"))
HANGUL = re.compile(r"[가-힣]")
SEC = re.compile(r"^\s*읽기\s*([12])\s*$")
MID = 297.5

def hangul(t):
    return len(HANGUL.findall(t))

out = []
for pi, p in enumerate(P):
    runs = p["runs"]
    labels = [r for r in runs if SEC.match(r["t"])]
    if not labels:
        continue
    # blue item numbers: bare digits at the left edge of a column, a little above each section label
    nums = [r for r in runs if re.fullmatch(r"\s*\d{1,2}\s*", r["t"]) and abs(r["s"] - 9.3) < 0.3
            and (abs(r["x"] - 53) < 4 or abs(r["x"] - 306) < 5) and 80 < r["y"] < 770]
    for lab in labels:
        right = lab["x"] > MID
        mine = min((n for n in nums if (n["x"] > MID) == right and n["y"] <= lab["y"] + 2), key=lambda n: lab["y"] - n["y"], default=None)
        top = mine["y"] if mine else lab["y"] - 12
        below = [n["y"] for n in nums if n["y"] > top + 5 and ((n["x"] > MID) == right)]
        bottom = min(below) if below else 770
        # full width when no card of the other column starts inside this card's height
        other = [n for n in nums if (n["x"] > MID) != right and top - 5 < n["y"] < bottom]
        full = not right and not other
        x0, x1 = (MID, 600) if right else (0, 600 if full else MID)
        body = [r for r in runs if x0 <= r["x"] < x1 and top < r["y"] < bottom and r is not lab and r is not mine]
        title = [r for r in body if r["s"] >= 10.0 and r["y"] < lab["y"] + 20]
        uz = [r for r in body if r["s"] < 7.5 and r["y"] < lab["y"] + 45]
        gram = [r for r in body if r["s"] < 8.3 and r not in uz]             # grammar box, vocabulary footer
        qs = [r for r in body if abs(r["s"] - 9.3) < 0.25 or (r["s"] >= 10.9 and r not in title)]
        passage = [r for r in body if r not in title and r not in uz and r not in gram and r not in qs]
        ptxt = " ".join(r["t"] for r in sorted(passage, key=lambda r: (round(r["y"] / 4), r["x"])))
        qtxt = " ".join(r["t"] for r in sorted(qs, key=lambda r: (round(r["y"] / 4), r["x"])))
        answers = len(re.findall(r"①", qtxt)) + len(re.findall(r"(?:^|\s)\d\)", qtxt)) - (1 if re.search(r"\d\).*①", qtxt) and "•" in qtxt else 0)
        answers = max(1, len(re.findall(r"(?:^|\s)[1-9]\)", qtxt)) + (qtxt.count("①") if not re.search(r"(?:^|\s)[1-9]\)", qtxt) else 0))
        kind = ("O/X" if "○" in qtxt or "×" in qtxt else "moslash" if "•" in qtxt else
                "tartib" if "순서" in "".join(r["t"] for r in title) else "tanlash" if "①" in qtxt else "yozma javob")
        ps, qsyl = hangul(ptxt), hangul(qtxt)
        need = (ps + qsyl) / SPM * 60 + answers * SPA
        minutes = max(1.0, math.ceil(need / 30) * 0.5)
        out.append({"page": pi + 1, "n": p["n"], "sec": "읽기 " + SEC.match(lab["t"]).group(1),
                    "title": " ".join(r["t"] for r in title), "passage": ps, "questions": qsyl, "answers": answers,
                    "kind": kind, "seconds": round(need), "minutes": minutes, "text": ptxt})
json.dump(out, open(f"html_books/{key}/{key}.reading.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{'bet':>4} {'bo`lim':6} {'matn':>5} {'savol':>5} {'javob':>5} {'tur':10} {'hisob':>6} {'taymer':>6}  sarlavha")
for o in out:
    print(f"{o['n']:>4} {o['sec']:6} {o['passage']:>5} {o['questions']:>5} {o['answers']:>5} {o['kind']:10} {o['seconds']:>5}s {o['minutes']:>5}분  {o['title'][:40]}")
