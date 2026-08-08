#!/usr/bin/env python3
"""
Semantic PMI from STEP AP242 — dimensions, geometric tolerances and datums.

WHY THIS IS SEPARATE FROM THE GEOMETRY ENGINE. Everything else this tool measures
comes from the SHAPE: draft from triangle normals, wall from ray casts, holes from
the B-rep. Tolerances are not in the shape. They are annotations carried alongside
it, and only AP242 with semantic (machine-readable) PMI carries them at all — an
AP203 or AP214 file, or an AP242 exported with graphical-only PMI, has nothing
here to find. That is why `dfm-rule-catalogue.mjs` listed tolerance stack-up as
UNWRITTEN: the measurement did not exist rather than being hard.

THE HONEST ANSWER WHEN THERE IS NOTHING. Most STEP files in circulation carry no
semantic PMI, and the dangerous failure would be to report "no tolerance problems"
for a part whose tolerances were simply never in the file. `present: False` always
travels with a REASON, and every rule written against these measures abstains
rather than passing.

Read via STEPCAFControl_Reader with GDT mode on, which is OCCT's own AP242 PMI
path — the same reader CAD systems use to round-trip PMI, rather than a hand-
rolled parse of the STEP text.
"""
import math


#: Tolerance classes, coarsest first. A "tight" tolerance is a relative judgement
#: — 0.1 mm is loose on a casting and tight on a machined bore — so the raw span
#: is reported and the RULES apply the process band, not this module.
def _tol_span(dim_obj):
    """Total tolerance band in mm, or None when the dimension carries none.

    A dimension can express its tolerance three ways in AP242 and only one of
    them is present on any given entity, so all three are tried before giving up.
    Returning 0.0 for "no tolerance found" would make an untoleranced dimension
    look like the tightest one on the part.
    """
    try:
        lower = dim_obj.GetLowerTolValue()
        upper = dim_obj.GetUpperTolValue()
        if lower is not None and upper is not None:
            span = abs(float(upper)) + abs(float(lower))
            if math.isfinite(span) and span > 0:
                return span
    except Exception:
        pass
    try:
        # A class-based tolerance (ISO 286 fit) carries no explicit values on the
        # object; the grade is reported instead and the span stays unknown.
        if dim_obj.IsDimWithClassOfTolerance():
            return None
    except Exception:
        pass
    try:
        vals = dim_obj.GetValues()
        if vals is not None and vals.Length() >= 2:
            span = abs(float(vals.Value(2)) - float(vals.Value(1)))
            if math.isfinite(span) and span > 0:
                return span
    except Exception:
        pass
    return None


#: Geometric-tolerance names, READ FROM OCCT'S OWN ENUM rather than typed out.
#: A hand-written map was wrong the first time it was tested: a flatness callout
#: came back as "symmetry", because the guessed ordering did not match the
#: build's. Deriving it means a tolerance type this build knows about cannot be
#: mislabelled, and one it does not is reported by its raw value instead of being
#: silently renamed.
def _geom_tol_names():
    try:
        from OCP.XCAFDimTolObjects import XCAFDimTolObjects_GeomToleranceType as G
        prefix = "XCAFDimTolObjects_GeomToleranceType_"
        out = {}
        for n in dir(G):
            if not n.startswith(prefix):
                continue
            label = n[len(prefix):]
            # CamelCase -> "circular runout"
            words, cur = [], ""
            for ch in label:
                if ch.isupper() and cur:
                    words.append(cur)
                    cur = ch
                else:
                    cur += ch
            if cur:
                words.append(cur)
            out[int(getattr(G, n))] = " ".join(words).lower()
        return out
    except Exception:
        return {}


_GEOM_TOL_NAMES = _geom_tol_names()


def extract_pmi(filepath):
    """Semantic PMI from an AP242 file.

    Returns a block that is ALWAYS shaped the same, whether or not the file has
    any PMI, so no caller has to guess between "absent" and "none found".
    """
    out = {
        "present": False,
        "reason": None,
        "dimensionCount": 0,
        "geometricToleranceCount": 0,
        "datumCount": 0,
        "tightestToleranceMm": None,
        "dimensions": [],
        "geometricTolerances": [],
        "datums": [],
        "method": "STEPCAFControl_Reader with GDT mode — OCCT's own AP242 semantic-PMI path",
    }
    try:
        from OCP.STEPCAFControl import STEPCAFControl_Reader
        from OCP.TDocStd import TDocStd_Document
        from OCP.TCollection import TCollection_ExtendedString
        from OCP.XCAFDoc import XCAFDoc_DocumentTool
        from OCP.TDF import TDF_LabelSequence
    except Exception as e:
        out["reason"] = f"This build cannot read AP242 PMI: {e}"
        return out

    try:
        doc = TDocStd_Document(TCollection_ExtendedString("pmi"))
        reader = STEPCAFControl_Reader()
        reader.SetGDTMode(True)
        reader.SetNameMode(True)
        if not reader.ReadFile(filepath):
            out["reason"] = "The file could not be opened as STEP for PMI reading."
            return out
        if not reader.Transfer(doc):
            out["reason"] = "STEP transferred no product structure, so there is nothing to read PMI from."
            return out
        tool = XCAFDoc_DocumentTool.DimTolTool_s(doc.Main())
    except Exception as e:
        out["reason"] = f"PMI reader failed: {e}"
        return out

    # ── Dimensions ───────────────────────────────────────────────────────────
    spans = []
    try:
        labels = TDF_LabelSequence()
        tool.GetDimensionLabels(labels)
        out["dimensionCount"] = labels.Length()
        for i in range(1, labels.Length() + 1):
            lab = labels.Value(i)
            row = {"span": None, "value": None, "type": None}
            try:
                from OCP.XCAFDoc import XCAFDoc_Dimension
                attr = XCAFDoc_Dimension.Set_s(lab)
                obj = attr.GetObject()
                span = _tol_span(obj)
                row["span"] = round(span, 4) if span is not None else None
                try:
                    vals = obj.GetValues()
                    if vals is not None and vals.Length() >= 1:
                        row["value"] = round(float(vals.Value(1)), 4)
                except Exception:
                    pass
                try:
                    row["type"] = int(obj.GetType())
                except Exception:
                    pass
                if span is not None:
                    spans.append(span)
            except Exception:
                pass
            out["dimensions"].append(row)
    except Exception as e:
        out["reason"] = f"Dimensions could not be read: {e}"

    # ── Geometric tolerances ─────────────────────────────────────────────────
    try:
        labels = TDF_LabelSequence()
        tool.GetGeomToleranceLabels(labels)
        out["geometricToleranceCount"] = labels.Length()
        for i in range(1, labels.Length() + 1):
            lab = labels.Value(i)
            row = {"type": None, "typeName": None, "valueMm": None}
            try:
                from OCP.XCAFDoc import XCAFDoc_GeomTolerance
                obj = XCAFDoc_GeomTolerance.Set_s(lab).GetObject()
                try:
                    t = int(obj.GetType())
                    row["type"] = t
                    row["typeName"] = _GEOM_TOL_NAMES.get(t, f"type {t}")
                except Exception:
                    pass
                try:
                    v = float(obj.GetValue())
                    if math.isfinite(v) and v > 0:
                        row["valueMm"] = round(v, 4)
                        spans.append(v)
                except Exception:
                    pass
            except Exception:
                pass
            out["geometricTolerances"].append(row)
    except Exception:
        pass

    # ── Datums ───────────────────────────────────────────────────────────────
    try:
        labels = TDF_LabelSequence()
        tool.GetDatumLabels(labels)
        out["datumCount"] = labels.Length()
        for i in range(1, labels.Length() + 1):
            row = {"name": None}
            try:
                from OCP.XCAFDoc import XCAFDoc_Datum
                obj = XCAFDoc_Datum.Set_s(labels.Value(i)).GetObject()
                n = obj.GetName()
                row["name"] = n.ToCString() if n is not None else None
            except Exception:
                pass
            out["datums"].append(row)
    except Exception:
        pass

    total = out["dimensionCount"] + out["geometricToleranceCount"] + out["datumCount"]
    out["present"] = total > 0
    if spans:
        out["tightestToleranceMm"] = round(min(spans), 4)
    if not out["present"] and not out["reason"]:
        # THE ANSWER THAT MATTERS MOST. A part with no PMI in the file is not a
        # part with no tolerances — the tolerances are on a drawing this tool has
        # never seen. Saying "no tolerance problems found" here would be the
        # single most dangerous sentence the report could print.
        out["reason"] = ("This file carries no semantic PMI. That means the tolerances were "
                         "not exported into the STEP — not that the part has none. They are "
                         "on the drawing, and every tolerance rule below abstains rather than "
                         "passing. Re-export as AP242 with semantic PMI to have them checked.")
    # Cap the detail lists: a report does not need 400 dimension rows, and the
    # counts and the tightest value are what the rules are written against.
    out["dimensions"] = [d for d in out["dimensions"] if d.get("span") is not None][:40]
    out["geometricTolerances"] = out["geometricTolerances"][:40]
    out["datums"] = out["datums"][:20]
    return out


if __name__ == "__main__":
    import json
    import sys
    print(json.dumps(extract_pmi(sys.argv[1])))
