"""
Strip nesting for a developed blank — FASTBLANK's "Nesting & Material Yield".

For a blank outline, find the coil orientation and layout that use the least
metal: strip width = blank height across the coil + 2 edge margins; pitch = the
smallest advance at which the next blank clears this one by the web. Measured
exactly along scanlines, so non-convex blanks are allowed to interlock, and
tried 1-up and 2-up with the second blank turned 180 degrees.
"""
import math
import numpy as np

def scan_intervals(P, ys):
    """For each scanline y, the x-intervals inside polygon P (even-odd)."""
    x0, y0 = P[:, 0], P[:, 1]; x1, y1 = np.roll(x0, -1), np.roll(y0, -1)
    out = []
    for y in ys:
        m = (y0 <= y) != (y1 <= y)
        xs = np.sort(x0[m] + (y - y0[m]) * (x1[m] - x0[m]) / (y1[m] - y0[m]))
        out.append(xs.reshape(-1, 2) if len(xs) % 2 == 0 else np.empty((0, 2)))
    return out

def min_pitch(A, B, ys, web):
    """Smallest p >= 0 with B+(p,0) clear of A by `web` on every scanline."""
    forb = []
    for Ia, Ib in zip(scan_intervals(A, ys), scan_intervals(B, ys)):
        for a in Ia:
            for b in Ib:
                forb.append((a[0] - b[1] - web, a[1] - b[0] + web))
    forb.sort(); p = 0.0
    for lo, hi in forb:
        if lo <= p < hi: p = hi
        elif lo > p: break
    # a second pass: intervals are sorted by lo, but a jump can land in an earlier one
    changed = True
    while changed:
        changed = False
        for lo, hi in forb:
            if lo <= p < hi: p = hi; changed = True
    return p

def rot(P, deg):
    a = math.radians(deg); R = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
    return P @ R.T

def area(P):
    x, y = P[:, 0], P[:, 1]
    return 0.5 * abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))

def nest(P, t, step=5, n_scan=300):
    web = edge = max(1.5 * t, 3.0)
    A0 = area(P); best = {}
    for deg in range(0, 180, step):
        Q = rot(P, deg); Q = Q - Q.min(0)
        h = Q[:, 1].max(); ys = np.linspace(1e-6, h - 1e-6, n_scan)
        # 1-up
        p1 = min_pitch(Q, Q, ys, web)
        u1 = A0 / (p1 * (h + 2 * edge))
        if u1 > best.get('1-up', (0,))[0]: best['1-up'] = (u1, deg, p1, h + 2 * edge)
        # 2-up, the partner turned 180 degrees and slid alongside (same strip)
        R = rot(Q, 180); R = R - R.min(0)
        if abs(R[:, 1].max() - h) < 1e-6:
            q = min_pitch(Q, R, ys, web)                      # partner offset
            p2 = min_pitch(Q, Q, ys, web)                     # the pair repeats at the 1-up pitch...
            p2 = max(p2, q + min_pitch(R, Q, ys, web))        # ...or wider if the partner forces it
            u2 = 2 * A0 / (p2 * (h + 2 * edge))
            if u2 > best.get('2-up', (0,))[0]: best['2-up'] = (u2, deg, p2, h + 2 * edge)
    return best

if __name__ == '__main__':
    t = 1.5
    # The L-shaped blank from the earlier proof: 250 x 215 envelope, fills 75%.
    L = np.array([[0, 0], [250, 0], [250, 110], [120, 110], [120, 215], [0, 215]], float)
    rect_blank = 250 * 215
    b = nest(L, t)
    web = max(1.5 * t, 3)
    print(f'L-blank {area(L)/100:.0f} cm² in a 250 x 215 envelope')
    print(f'  tool today — rectangle blank, 1-up: utilisation {area(L)/((250+web)*(215+2*web))*100:5.1f}%'
          f'   (and the rectangle itself is {rect_blank/100:.0f} cm² bought per part)')
    for k, (u, deg, p, w) in b.items():
        print(f'  {k}: utilisation {u*100:5.1f}%  at {deg:3d}°   pitch {p:6.1f} mm   strip {w:6.1f} mm')
