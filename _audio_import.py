# Puts a book's recordings on the site: every file in a zip or folder whose name carries a YouTube id
# "(xxxxxxxxxxx)" that one of the book's QR codes points to becomes audio/<key>/<id>.mp3 —
# picture and tags removed, mono 48 kbps (speech), so it downloads fast.
# Usage: python _audio_import.py <key> <zip or folder> [<ffmpeg>]
import sys, os, re, json, zipfile, subprocess, tempfile

key, source = sys.argv[1], sys.argv[2]
ffmpeg = sys.argv[3] if len(sys.argv) > 3 else "ffmpeg"
want = {q["yt"]: q.get("title", "") for q in json.load(open(f"html_books/{key}/{key}.qr.json", encoding="utf-8"))}
ID = re.compile(r"\(([A-Za-z0-9_-]{11})\)[^/\\]*\.(mp3|m4a|mp4|webm|ogg|opus|wav)$", re.I)

found = {}
if zipfile.is_zipfile(source):
    z = zipfile.ZipFile(source)
    for i in z.infolist():
        m = ID.search(i.filename)
        if m and m.group(1) in want:
            found[m.group(1)] = ("zip", i)
else:
    for root, _, files in os.walk(source):
        for f in files:
            m = ID.search(f)
            if m and m.group(1) in want:
                found[m.group(1)] = ("file", os.path.join(root, f))

os.makedirs(f"audio/{key}", exist_ok=True)
tmp = tempfile.mkdtemp()
total = 0
for vid, (kind, ref) in sorted(found.items()):
    src = ref
    if kind == "zip":
        src = os.path.join(tmp, "in" + os.path.splitext(ref.filename)[1])
        open(src, "wb").write(z.read(ref))
    dst = f"audio/{key}/{vid}.mp3"
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", src, "-vn", "-map_metadata", "-1",
                    "-ac", "1", "-ar", "44100", "-b:a", "48k", dst], check=True)
    total += os.path.getsize(dst)
missing = [t or v for v, t in want.items() if v not in found]
print(f"{key}: {len(found)} / {len(want)} ta audio, {total / 1e6:.1f} MB")
for t in missing:
    print("  yo'q:", t)
