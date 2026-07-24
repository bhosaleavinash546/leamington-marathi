"""Word-level overflow scan: flags any word drawn past the right margin or
page bottom. Zero output (beyond the summary lines) = clean."""
import sys, fitz
MM = 72 / 25.4
bad = 0
for path in sys.argv[1:]:
    d = fitz.open(path)
    print(f"{path} -> {len(d)} pages")
    for pno, page in enumerate(d, 1):
        for x0, y0, x1, y1, word, *_ in page.get_text("words"):
            if x1 > (210 - 11) * MM:
                print(f"  p{pno} RIGHT-OVERFLOW: '{word}' x1={x1/MM:.1f}mm"); bad += 1
            if y1 > (297 - 3) * MM:
                print(f"  p{pno} BOTTOM-OVERFLOW: '{word}'"); bad += 1
print("overflow issues:", bad)
sys.exit(1 if bad else 0)
