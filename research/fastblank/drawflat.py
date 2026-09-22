import sys; sys.path.insert(0, '.')
import numpy as np, math, glob
from PIL import Image, ImageDraw, ImageFont
import proto
f = sorted(glob.glob('skin*.npz'))[0]; z = np.load(f)
U, outer = z['U'], z['outer']
d0 = proto.min_rect(U[outer])[3]; a = math.radians(d0)
R = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]]); P = U @ R
P = P - P[outer].min(0)
w, h = P[outer].max(0)
W, H = 1400, 700; sc = 2.0; ox, oy = 60, 90
img = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(img)
try:
    F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 17)
    Fs = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
except Exception:
    F = Fs = None
def xy(p, x0): return (x0 + p[0] * sc, H - 60 - p[1] * sc)
# left: what the tool buys today
bw, bh = 269, 237
d.rectangle([ox, H - 60 - bh * sc, ox + bw * sc, H - 60], outline=(200, 40, 40), width=3, fill=(252, 232, 232))
d.text((ox, 20), 'What CostVision assumes today', fill=(150, 30, 30), font=F)
d.text((ox, 44), 'formed-part bounding box x 1.05 = 269 x 237 mm = 637 cm2 bought', fill=(90, 90, 90), font=Fs)
d.text((ox, 62), 'cut length used for tonnage: 2(L+W) = 1,012 mm', fill=(90, 90, 90), font=Fs)
# right: the developed blank
x1 = 720
d.rectangle([x1, H - 60 - h * sc, x1 + w * sc, H - 60], outline=(40, 90, 200), width=2)
T = z['T']
for tri in T:
    d.polygon([xy(P[j], x1) for j in tri], fill=(205, 222, 240))
from proto import boundary_loops
loops = boundary_loops(T)
for lp in loops:
    pts = [xy(P[j], x1) for j in lp]
    d.line(pts + [pts[0]], fill=(20, 40, 90), width=2)
d.text((x1, 20), 'Developed blank (prototype solver)', fill=(20, 60, 140), font=F)
d.text((x1, 44), f'outline 490 cm2, fills 83% of its {w:.0f} x {h:.0f} mm rectangle', fill=(90, 90, 90), font=Fs)
d.text((x1, 62), 'cut 954 mm outline + 985 mm piercing (21 holes) = 1,939 mm', fill=(90, 90, 90), font=Fs)
img.save('seat-bracket-blank.png'); print('saved', w, h)
