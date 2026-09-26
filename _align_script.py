# Word timing for the 대본 marker: every line's words get the second they are spoken, so a highlight can sweep over
# the script at the pace of the recording. Whisper hears the recording with word timestamps; its syllables are aligned
# to the printed script (which stays the text shown), and each whitespace word gets [start, end].
# Usage: python _align_script.py <key> [yt ...]      (writes "w" into html_books/<key>/<key>.listen.json)
import sys, json, re, difflib, subprocess
from faster_whisper import WhisperModel

key, only = sys.argv[1], set(sys.argv[2:])
path = f"html_books/{key}/{key}.listen.json"
data = json.load(open(path, encoding="utf-8"))
model = WhisperModel("small", device="cpu", compute_type="int8")
SYL = re.compile(r"[가-힣A-Za-z0-9]")

def silences(f):
    """Quiet stretches of the recording; whisper lets words start inside the pause before them, these trim that."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", f, "-af", "silencedetect=noise=-35dB:d=0.18", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    st = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r)]
    en = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r)]
    return list(zip(st, en))

for yt, item in data.items():
    if yt == "_" or (only and yt not in only):
        continue
    SIL = silences(f"audio/{key}/{yt}.mp3")
    segs, _ = model.transcribe(f"audio/{key}/{yt}.mp3", language="ko", word_timestamps=True, vad_filter=False,
                               initial_prompt=" ".join(l["x"] for l in item["lines"]))
    heard = []                                            # (syllable, start, end) spread evenly over each word
    for s in segs:
        for w in s.words:
            sy = SYL.findall(w.word)
            for i, c in enumerate(sy):
                d = (w.end - w.start) / len(sy)
                heard.append((c, w.start + i * d, w.start + (i + 1) * d))
    first = item["lines"][0]["t"] - 0.3                   # skip the read-out instruction before the dialogue
    heard = [h for h in heard if h[2] > first]
    script = []                                           # (line, word, syllable)
    for li, l in enumerate(item["lines"]):
        for wi, w in enumerate(l["x"].split()):
            for c in SYL.findall(w):
                script.append((li, wi, c))
    sm = difflib.SequenceMatcher(None, [c for *_, c in script], [c for c, *_ in heard], autojunk=False)
    t = [None] * len(script)
    for a, b, n in sm.get_matching_blocks():
        for k in range(n):
            t[a + k] = (heard[b + k][1], heard[b + k][2])
    known = [i for i, v in enumerate(t) if v]
    for i in range(len(t)):                               # unmatched syllables: interpolate between neighbours
        if t[i]:
            continue
        lo = max((k for k in known if k < i), default=None)
        hi = min((k for k in known if k > i), default=None)
        if lo is None and hi is None:
            continue
        a = t[lo][1] if lo is not None else t[hi][0] - 0.3 * (hi - i)
        b = t[hi][0] if hi is not None else a + 0.3 * (i - lo)
        n0 = lo if lo is not None else i - 1
        n1 = hi if hi is not None else i + 1
        f0, f1 = (i - n0) / (n1 - n0), (i + 1 - n0) / (n1 - n0)
        t[i] = (a + (b - a) * f0, a + (b - a) * f1)
    for li, l in enumerate(item["lines"]):
        words = []
        for wi, w in enumerate(l["x"].split()):
            ts = [t[k] for k, (a, b, _) in enumerate(script) if a == li and b == wi and t[k]]
            words.append([round(ts[0][0], 2), round(ts[-1][1], 2)] if ts else None)
        for wi in range(len(words)):                      # a word with no letters (e.g. "…") borrows its neighbour's time
            if words[wi] is None:
                words[wi] = words[wi - 1] if wi else next((x for x in words if x), [l["t"], l["t"]])
        quiet = SIL
        for w in words:                                   # a word starts after, and ends before, the pause around it
            for a, b in quiet:
                if a <= w[0] < b:
                    w[0] = b
                if a < w[1] <= b:
                    w[1] = a
            if w[1] <= w[0]:
                w[1] = w[0] + 0.15
        if words:
            words[0][0] = max(words[0][0], l["t"])
        for i, w in enumerate(words):                     # a word lasts until the next one starts, or the next pause
            nxt = words[i + 1][0] if i + 1 < len(words) else None
            gap = [a for a, b in quiet if a >= w[1] - 0.05 and (nxt is None or a < nxt)]
            if gap:
                w[1] = max(w[1], gap[0])
            elif nxt is not None:
                w[1] = max(w[1], nxt)
        l["w"] = [[round(float(a), 2), round(float(b), 2)] for a, b in words]
    matched = sum(1 for v in known) / max(1, len(script))
    print(f"{yt} {item.get('title', '')}: {len(script)} bo'g'in, {matched:.0%} eshitilgan bilan mos")
    for l in item["lines"]:
        print("   ", l["n"], l["t"], l["w"][:3], "...", l["w"][-1])

json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
