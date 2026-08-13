#!/usr/bin/env python3
"""
Generate a true involute spur gear STEP with KNOWN parameters — the ground
truth for verifying the gear metrology in cad-geometry-engine.py.

    python3 scripts/gen-test-gear.py <out.step> [module] [teeth] [faceWidth] [boreDia]

Default: m=3, z=38, b=30, bore=40 — the same gear as the worked example and the
deck's spur-gear illustration, so every layer of the story uses one part.
OD = m(z+2) = 120 mm exactly; the metrology must recover z=38 and m=3.
"""
import math
import sys

import cadquery as cq


def involute_pts(rb, r_from, r_to, steps=14):
    """Involute of a circle rb, from radius r_from to r_to, as (r, phi) points."""
    pts = []
    for i in range(steps + 1):
        r = r_from + (r_to - r_from) * i / steps
        if r < rb:
            r = rb
        t = math.sqrt(max(r * r / (rb * rb) - 1.0, 0.0))   # roll angle
        phi = t - math.atan(t)                              # involute polar angle
        pts.append((r, phi))
    return pts


def make_gear(m=3.0, z=38, b=30.0, bore=40.0, alpha_deg=20.0):
    alpha = math.radians(alpha_deg)
    rp = m * z / 2.0            # pitch radius
    rb = rp * math.cos(alpha)   # base radius
    ra = rp + m                 # addendum (tip) radius
    rf = rp - 1.25 * m          # dedendum (root) radius

    # Angle of the involute at the pitch circle, and the tooth half-thickness
    # angle at the pitch circle (s = pi*m/2 on the pitch circle).
    t_p = math.sqrt(rp * rp / (rb * rb) - 1.0)
    phi_p = t_p - math.atan(t_p)
    half_tooth = (math.pi * m / 2.0) / (2.0 * rp)   # half thickness angle at pitch

    # One flank: involute from max(rf, rb) to ra, rotated so the pitch point
    # sits at -half_tooth; the mirrored flank at +half_tooth.
    r_start = max(rf, rb)
    flank = involute_pts(rb, r_start, ra)
    left = [(r, -half_tooth - phi_p + phi) for r, phi in flank]
    right = [(r, half_tooth + phi_p - phi) for r, phi in flank]

    pitch_ang = 2.0 * math.pi / z

    def v(r, a):
        return cq.Vector(r * math.cos(a), r * math.sin(a), 0.0)

    # Build the profile from explicit edges — spline flanks, TRUE ARCS at tip
    # and root (a polyline tip becomes a planar chord face; real CAD gears
    # carry cylindrical tip lands, which is what the metrology counts). Four
    # edges per tooth also keeps us clear of the Workplane fluent-chain
    # recursion limit that ~650 chained calls trip.
    tip_l = left[-1][1]      # tip angle, left flank end
    tip_r = right[-1][1]     # tip angle, right flank end
    root_r = right[0][1]     # root angle, right flank start
    root_l = left[0][1]      # root angle, left flank start

    teeth_pts = []
    for k in range(z):
        rot = k * pitch_ang
        teeth_pts.append({
            'L': [v(r, a + rot) for r, a in left],
            'R': [v(r, a + rot) for r, a in reversed(right)],   # tip → root
            'tip_mid': v(ra, (tip_l + tip_r) / 2.0 + rot),
            'root_mid': v(rf, (root_r + pitch_ang + root_l) / 2.0 + rot),
        })

    edges = []
    for k in range(z):
        t, nxt = teeth_pts[k], teeth_pts[(k + 1) % z]
        edges.append(cq.Edge.makeSpline(t['L']))                      # left flank up
        edges.append(cq.Edge.makeThreePointArc(t['L'][-1], t['tip_mid'], t['R'][0]))
        edges.append(cq.Edge.makeSpline(t['R']))                      # right flank down
        edges.append(cq.Edge.makeThreePointArc(t['R'][-1], t['root_mid'], nxt['L'][0]))

    wire = cq.Wire.assembleEdges(edges)
    face = cq.Face.makeFromWires(wire)
    solid = cq.Solid.extrudeLinear(face, cq.Vector(0, 0, b))
    solid = solid.cut(cq.Solid.makeCylinder(bore / 2.0, b))
    return solid


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'test-gear-m3-z38.step'
    m = float(sys.argv[2]) if len(sys.argv) > 2 else 3.0
    z = int(sys.argv[3]) if len(sys.argv) > 3 else 38
    b = float(sys.argv[4]) if len(sys.argv) > 4 else 30.0
    bore = float(sys.argv[5]) if len(sys.argv) > 5 else 40.0
    g = make_gear(m, z, b, bore)
    g.exportStep(out)
    print(f'wrote {out}: m={m} z={z} b={b} bore={bore} OD={m * (z + 2)}')


if __name__ == '__main__':
    main()
