"""Polymer extrusions, modelled in OCP for the extrusion build (3 Oct 2026).

NOT customer parts. Three typical automotive polymer extrusions, cut to length:

* a fuel / brake line tube: Ø8 x 1 mm wall, 600 mm — PA12, on a small-tube line;
* a vent / coolant pipe: Ø32 x 3 mm wall, 1,000 mm — HDPE, on the pipe line;
* a twin-chamber conduit / trim profile: 40 x 25 mm, 2 mm walls and a centre
  web, 2,000 mm — rigid PVC, on the profile line.

Exported as STEP AP214. Run: python3 EXT_modelled_parts.py <out-dir>
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
def write(s, path, name):
    # The writer first: creating it resets the product-name parameter.
    w = STEPControl_Writer()
    Interface_Static.SetCVal_s('write.step.schema', 'AP214IS')
    Interface_Static.SetCVal_s('write.step.product.name', name)
    w.Transfer(s, STEPControl_AsIs); w.Write(path)

def tube(od, wall, length):
    return cut(cyl((0, 0, 0), (1, 0, 0), od / 2, length), cyl((-1, 0, 0), (1, 0, 0), od / 2 - wall, length + 2))

out = sys.argv[1]
write(tube(8, 1.0, 600), f'{out}/EXT_Fuel_Line_Tube.stp', 'FUEL LINE TUBE PA12 EXTRUDED')
write(tube(32, 3.0, 1000), f'{out}/EXT_Vent_Pipe.stp', 'VENT PIPE HDPE EXTRUDED')
# Twin-chamber profile: 40 wide (Y) x 25 tall (Z), 2 mm walls, centre web, along X.
L, W, H, t = 2000, 40, 25, 2.0
p = box(0, 0, 0, L, W, H)
p = cut(p, box(-1, t, t, L + 2, (W - 3 * t) / 2, H - 2 * t))
p = cut(p, box(-1, t + (W - 3 * t) / 2 + t, t, L + 2, (W - 3 * t) / 2, H - 2 * t))
write(p, f'{out}/EXT_Twin_Chamber_Profile.stp', 'TWIN CHAMBER CONDUIT PROFILE PVC EXTRUDED')
