"""Extract image XObjects (raw RGB after undoing FlateDecode) from a jsPDF file. usage: pdfimages.py <pdf> <outdir>"""
import re, sys, zlib, os, hashlib, json
pdf = open(sys.argv[1], 'rb').read(); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
res = []
for m in re.finditer(rb'(\d+) 0 obj\s*<<(.*?)>>\s*stream\r?\n', pdf, re.S):
    d = m.group(2)
    if b'/Subtype /Image' not in d: continue
    if b'/SMask' in d and False: pass
    w = int(re.search(rb'/Width (\d+)', d).group(1)); h = int(re.search(rb'/Height (\d+)', d).group(1))
    ln = int(re.search(rb'/Length (\d+)', d).group(1))
    data = pdf[m.end():m.end() + ln]
    filt = re.search(rb'/Filter\s*/(\w+)', d); filt = filt.group(1).decode() if filt else 'NONE'
    dp = re.search(rb'/DecodeParms\s*<<(.*?)>>', d, re.S)
    cs = re.search(rb'/ColorSpace /(\w+)', d); cs = cs.group(1).decode() if cs else '?'
    raw = zlib.decompress(data) if filt == 'FlateDecode' else data
    pred = None
    if dp and b'/Predictor' in dp.group(1):
        pred = int(re.search(rb'/Predictor (\d+)', dp.group(1)).group(1))
        cols = int(re.search(rb'/Columns (\d+)', dp.group(1)).group(1)); colors = int(re.search(rb'/Colors (\d+)', dp.group(1)).group(1))
        bpp = colors; stride = cols * colors; outb = bytearray(); prev = bytearray(stride)
        for y in range(h):
            row = raw[y * (stride + 1):(y + 1) * (stride + 1)]; ft = row[0]; cur = bytearray(row[1:])
            for i in range(stride):
                a = cur[i - bpp] if i >= bpp else 0; b = prev[i]; c = prev[i - bpp] if i >= bpp else 0
                if ft == 1: cur[i] = (cur[i] + a) & 255
                elif ft == 2: cur[i] = (cur[i] + b) & 255
                elif ft == 3: cur[i] = (cur[i] + ((a + b) >> 1)) & 255
                elif ft == 4:
                    p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                    cur[i] = (cur[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
            outb += cur; prev = cur
        raw = bytes(outb)
    smask = b'/SMask' in d
    name = f'obj{m.group(1).decode()}_{w}x{h}_{cs}.raw'
    open(os.path.join(out, name), 'wb').write(raw)
    res.append({'obj': int(m.group(1)), 'w': w, 'h': h, 'colorSpace': cs, 'filter': filt, 'predictor': pred, 'storedBytes': ln, 'rawBytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'hasSMask': smask})
print(json.dumps({'file': sys.argv[1], 'bytes': len(pdf), 'images': res}, indent=1))
