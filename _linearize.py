# Save each book PDF "linearized" (fast web view): the first page's objects come first in the file,
# so the browser can show page 1 after the first chunk instead of reading the whole file.
import sys, os, pikepdf
for f in sys.argv[1:]:
    tmp = f + ".lin"
    with pikepdf.open(f) as pdf:
        pdf.save(tmp, linearize=True, object_stream_mode=pikepdf.ObjectStreamMode.generate, compress_streams=True)
    before, after = os.path.getsize(f), os.path.getsize(tmp)
    os.replace(tmp, f)
    print(f"{os.path.basename(f)}: {before/1048576:.1f} -> {after/1048576:.1f} MB, linearized")
