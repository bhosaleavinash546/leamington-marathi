#!/usr/bin/env python3
"""
Guard the ONE contract that makes a geometric DFM finding clickable: a feature's
`faceIds` and the mesh's `triFace` must speak the same face numbering.

They did not. `_extract_manufacturing_features` emitted 1-based
TopTools_IndexedMapOfShape indices; the tessellator emitted a dense 0-based
counter that skipped untriangulated faces. Nothing crashed — the ids simply
pointed at the wrong faces, off by one on a clean part and by more once any face
failed to triangulate. A servo horn's "non-preferred hole diameter" finding
highlighted a 118 mm2 flat face on the underside instead of the bore, and the
only reason anyone noticed was that the review pack finally drew a picture.

A contract that is wrong in a way nothing fails on needs a test that runs the
kernel, which is why this lives here and not in vitest: CI has no cadquery, but
the Dockerfile.cad image does, and .github/workflows/docker-cad.yml runs this
inside it.

    python3 scripts/check-face-id-contract.py tests/fixtures/cad-parts/flange-6holes-boss.step
"""
import json
import os
import subprocess
import sys
import tempfile

ENGINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..',
                      'server', 'utils', 'cad-geometry-engine.py')

failures = []


def check(ok, what, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {what}{f' — {detail}' if detail else ''}")
    if not ok:
        failures.append(what)


def main(step_path):
    print(f"face-id contract · {os.path.basename(step_path)}")
    work = tempfile.mkdtemp()
    stl = os.path.join(work, 'mesh.stl')

    env = dict(os.environ, CV_EXTRACT_FEATURES='1')
    analysis = json.loads(subprocess.run(
        [sys.executable, ENGINE, step_path], capture_output=True, text=True,
        check=True, env=env).stdout)
    check(analysis.get('status') == 'success', 'analysis succeeds', analysis.get('error', ''))

    subprocess.run([sys.executable, ENGINE, '--stl', step_path, stl, '--with-meta'],
                   capture_output=True, text=True, check=True)
    with open(stl + '.json') as f:
        meta = json.load(f)

    tri_face, faces = meta['triFace'], meta['faces']
    mf = analysis.get('manufacturingFeatures') or {}
    feats = mf.get('features') or []
    check(bool(feats), f'features extracted ({len(feats)})')

    # 1. `faces` is indexed BY face id, so its length must cover every id used.
    check(max(tri_face) < len(faces), 'triFace ids index the faces array',
          f'max id {max(tri_face)}, faces len {len(faces)}')
    check(min(tri_face) >= 1, 'triFace ids are 1-based', f'min id {min(tri_face)}')

    # 2. Every id in triFace resolves to a face record that agrees with itself.
    ids = sorted(set(tri_face))
    bad_self = [i for i in ids if faces[i] is None or faces[i].get('id') != i]
    check(not bad_self, 'every meshed face id resolves to its own record',
          f'{len(bad_self)} mismatched: {bad_self[:5]}')

    # 3. THE contract: a hole/boss feature's faces must be the cylinders that
    #    define it. This is the assertion that would have caught the bug — under
    #    the old numbering these resolved to planes, and to nothing at all near
    #    the end of the map.
    meshed = set(tri_face)
    cyl_ok = cyl_bad = orphan = 0
    for feat in feats:
        if feat.get('kind') not in ('hole', 'boss'):
            continue
        for fid in feat.get('faceIds', []):
            if fid not in meshed:
                orphan += 1
                continue
            rec = faces[fid]
            if rec and rec.get('type') == 'cylinder':
                cyl_ok += 1
            else:
                cyl_bad += 1
    check(cyl_ok > 0, 'hole/boss features have meshed faces', f'{cyl_ok} checked')
    check(cyl_bad == 0, 'every hole/boss face id IS a cylinder in the mesh',
          f'{cyl_bad} resolved to a non-cylinder')
    check(orphan == 0, 'no hole/boss face id is absent from the mesh',
          f'{orphan} orphaned')

    # 4. And the mirror for planar features, so a fix that merely shifted the
    #    error the other way does not pass.
    plane_bad = sum(
        1 for feat in feats if feat.get('kind') == 'planar_face'
        for fid in feat.get('faceIds', [])
        if fid in meshed and (faces[fid] or {}).get('type') != 'plane')
    check(plane_bad == 0, 'every planar-face feature id IS a plane in the mesh',
          f'{plane_bad} mismatched')

    print(f"\n{'FAILED: ' + ', '.join(failures) if failures else 'all checks passed'}")
    return 1 if failures else 0


if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else 'tests/fixtures/cad-parts/flange-6holes-boss.step'
    sys.exit(main(target))
