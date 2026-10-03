"""Aluminium extrusions, modelled in OCP for the aluminium-extrusion build (Oct 2026).

NOT customer parts. Eight typical automotive / EV aluminium extrusions, one per
shape class the model must handle:

  AL_Crash_Box         6082  120 x 80 two-chamber hollow, 3 mm, 400 mm, 4 x Ø10 cross holes
  AL_Battery_Rail      6005A 150 x 60 four-chamber hollow, 2.5 mm, 1,800 mm
  AL_Trim_Channel      6063  40 x 15 x 2 mm open C-channel (solid die), 1,200 mm
  AL_Bumper_Beam       7003  140 x 40 two-chamber, 3 mm, 1,300 mm (bent after)
  AL_Heat_Sink         6063  120 x 6 base + 10 fins 2 x 35 mm, cut to 150 mm (short)
  AL_Machined_Bracket  6082  80 x 60 x 6 L-angle, 400 mm, 2 x Ø12 holes + an end notch
  AL_Busbar            6101  40 x 10 flat, 400 mm, 2 x Ø11 holes (Conform candidate)
  AL_Battery_Can       3003  Ø46 x 80 mm cup, 0.8 mm wall, 1 mm base (impact extrusion)

Exported as STEP AP214. Run: python3 AL_modelled_parts.py <out-dir>
"""
import sys
from OCP.gp import gp_Pnt, gp_Dir, gp_Ax2
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
from OCP.Interface import Interface_Static

def box(x, y, z, dx, dy, dz): return BRepPrimAPI_MakeBox(gp_Pnt(x, y, z), dx, dy, dz).Shape()
def cyl(p, d, r, h): return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(*p), gp_Dir(*d)), r, h).Shape()
def cut(a, b): return BRepAlgoAPI_Cut(a, b).Shape()
def fuse(a, b): return BRepAlgoAPI_Fuse(a, b).Shape()
def write(s, path, name):
    w = STEPControl_Writer()   # first: creating it resets the product-name parameter
    Interface_Static.SetCVal_s('write.step.schema', 'AP214IS')
    Interface_Static.SetCVal_s('write.step.product.name', name)
    w.Transfer(s, STEPControl_AsIs); w.Write(path)

def chambers(L, W, H, t, n):
    """A W x H rectangular hollow along X with n equal chambers (n - 1 internal webs)."""
    s = box(0, 0, 0, L, W, H)
    cw = (W - (n + 1) * t) / n
    for i in range(n):
        s = cut(s, box(-1, t + i * (cw + t), t, L + 2, cw, H - 2 * t))
    return s

out = sys.argv[1]
cb = chambers(400, 120, 80, 3.0, 2)
for x in (25, 60):
    for y in (30, 90):
        cb = cut(cb, cyl((x, y, -1), (0, 0, 1), 5, 82))
write(cb, f'{out}/AL_Crash_Box.stp', 'CRASH BOX 6082 T6 EXTRUDED')
write(chambers(1800, 150, 60, 2.5, 4), f'{out}/AL_Battery_Rail.stp', 'BATTERY TRAY RAIL 6005A EXTRUDED')
ch = cut(box(0, 0, 0, 1200, 40, 15), box(-1, 2, 2, 1202, 36, 14))
write(ch, f'{out}/AL_Trim_Channel.stp', 'TRIM CHANNEL 6063 EXTRUDED')
write(chambers(1300, 140, 40, 3.0, 2), f'{out}/AL_Bumper_Beam.stp', 'BUMPER BEAM 7003 EXTRUDED')
hs = box(0, 0, 0, 150, 120, 6)
for i in range(10):
    hs = fuse(hs, box(0, 4 + i * 12.4, 6, 150, 2, 35))
write(hs, f'{out}/AL_Heat_Sink.stp', 'HEAT SINK 6063 EXTRUDED')
br = fuse(box(0, 0, 0, 400, 80, 6), box(0, 0, 0, 400, 6, 60))
br = cut(br, cyl((40, 40, -1), (0, 0, 1), 6, 8))
br = cut(br, cyl((360, 40, -1), (0, 0, 1), 6, 8))
br = cut(br, box(-1, 30, -1, 31, 51, 8))          # end notch in the flange
write(br, f'{out}/AL_Machined_Bracket.stp', 'MOUNTING BRACKET 6082 EXTRUDED AND MACHINED')
bb = box(0, 0, 0, 400, 40, 10)
for x in (30, 370):
    bb = cut(bb, cyl((x, 20, -1), (0, 0, 1), 5.5, 12))
write(bb, f'{out}/AL_Busbar.stp', 'BUSBAR 6101 EXTRUDED')
can = cut(cyl((0, 0, 0), (0, 0, 1), 23, 80), cyl((0, 0, 1.0), (0, 0, 1), 22.2, 80))
write(can, f'{out}/AL_Battery_Can.stp', 'BATTERY CAN 3003 IMPACT EXTRUDED')
