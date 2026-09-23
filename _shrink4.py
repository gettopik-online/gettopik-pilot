# Shrink a book PDF for the web while keeping it crisp:
#  - images drawn larger than max_dpi are scaled down to about max_dpi
#  - big losslessly-stored images (Flate/PNG-like) are re-encoded as high-quality JPEG at the same size
#  - text and vector art are never touched, so they stay infinitely sharp
import sys, pymupdf

src, dst, max_dpi, quality = sys.argv[1], sys.argv[2], float(sys.argv[3]), int(sys.argv[4])
MIN_BYTES = 40_000
doc = pymupdf.open(src)
scaled = recoded = kept = failed = 0
seen = set()
for page in doc:
    for info in page.get_images(full=True):
        xref = info[0]
        if xref in seen:
            continue
        seen.add(xref)
        rects = page.get_image_rects(xref)
        if not rects:
            kept += 1
            continue
        try:
            raw_len = len(doc.xref_stream_raw(xref) or b"")
            filt = doc.xref_get_key(xref, "Filter")[1] or ""
            target_w = max(16, int(max_dpi * max(r.width for r in rects) / 72))
            pix = pymupdf.Pixmap(doc, xref)
            too_big = pix.width > target_w * 1.25
            lossless_heavy = raw_len > MIN_BYTES and "DCT" not in filt
            if not (too_big or lossless_heavy):
                kept += 1
                continue
            if pix.alpha:
                pix = pymupdf.Pixmap(pix, 0)
            if pix.colorspace is None or pix.colorspace.n not in (1, 3):
                pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
            n = 0
            while pix.width > target_w * 1.6 and n < 4:
                pix.shrink(1)
                n += 1
            data = pix.tobytes("jpeg", jpg_quality=quality)
            if not too_big and len(data) >= raw_len:
                kept += 1                      # JPEG would not be smaller — leave it alone
                continue
            page.replace_image(xref, stream=data)
            if too_big: scaled += 1
            else: recoded += 1
        except Exception:
            failed += 1
doc.save(dst, garbage=4, deflate=True, clean=True)
print(f"kichraytirildi: {scaled}, JPEG ga o'girildi: {recoded}, tegilmadi: {kept}, xato: {failed}")
