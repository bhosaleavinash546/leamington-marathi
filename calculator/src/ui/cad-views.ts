/**
 * Rendered CAD views — lets the vision model actually SEE the part.
 *
 * The analysis pipeline historically sent only text geometry metrics (volume,
 * bbox, surface area); feature reasoning (ribs, bosses, undercuts, thin walls)
 * had to be inferred from three numbers. This module parses an STL client-side
 * and renders four canonical views (isometric / front / top / right) with
 * three.js into JPEG snapshots that ride along to the vision model.
 *
 * v1 scope: STL only (the mesh is directly available client-side). STEP/IGES
 * would need server-side tessellation — a follow-up.
 */

interface ParsedMesh {
  positions: Float32Array;
  triangles: number;
}

/** Parse binary or ASCII STL into a flat position array (9 floats per triangle). */
export function parseSTLMesh(buf: ArrayBuffer): ParsedMesh {
  const bytes = new Uint8Array(buf);
  const headText = new TextDecoder().decode(bytes.slice(0, 512)).trimStart().toLowerCase();
  const looksAscii = headText.startsWith('solid') && headText.includes('facet');

  if (!looksAscii) {
    const dv = new DataView(buf);
    const count = dv.getUint32(80, true);
    const expected = 84 + count * 50;
    if (expected > buf.byteLength) throw new Error('binary STL truncated');
    const positions = new Float32Array(count * 9);
    for (let i = 0; i < count; i++) {
      const off = 84 + i * 50 + 12; // skip normal
      for (let v = 0; v < 9; v++) positions[i * 9 + v] = dv.getFloat32(off + v * 4, true);
    }
    return { positions, triangles: count };
  }

  const text = new TextDecoder().decode(bytes);
  const verts: number[] = [];
  const re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) verts.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  if (verts.length === 0 || verts.length % 9 !== 0) throw new Error('ASCII STL parse failed');
  return { positions: new Float32Array(verts), triangles: verts.length / 9 };
}

const VIEWS: Array<{ name: string; dir: [number, number, number] }> = [
  { name: 'isometric', dir: [1, 1, 1] },
  { name: 'front',     dir: [0, 0, 1] },
  { name: 'top',       dir: [0.001, 1, 0.001] },
  { name: 'right',     dir: [1, 0, 0] },
];

/**
 * Render four canonical views of an STL file to JPEG data URLs (512x512).
 * Returns [] on any failure — rendering is an enhancement, never a blocker.
 */
export async function renderSTLViews(file: File, size = 512): Promise<string[]> {
  try {
    const THREE = await import('three'); // lazy — three.js only loads when a CAD render is needed
    const { positions } = parseSTLMesh(await file.arrayBuffer());

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere;
    if (!sphere || !isFinite(sphere.radius) || sphere.radius <= 0) throw new Error('degenerate mesh');

    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(size, size, false);
    renderer.setClearColor(0xf4f6f8, 1);

    const scene = new THREE.Scene();
    const mat = new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 0.35, roughness: 0.55 });
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(-sphere.center.x, -sphere.center.y, -sphere.center.z); // centre at origin
    scene.add(mesh);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(1, 2, 1.5);
    scene.add(dir);

    const camDist = sphere.radius * 2.4;
    const camera = new THREE.PerspectiveCamera(40, 1, sphere.radius / 100, camDist * 10);

    const shots: string[] = [];
    for (const v of VIEWS) {
      const len = Math.hypot(...v.dir);
      camera.position.set((v.dir[0] / len) * camDist, (v.dir[1] / len) * camDist, (v.dir[2] / len) * camDist);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      shots.push(canvas.toDataURL('image/jpeg', 0.85));
    }

    renderer.dispose();
    geometry.dispose();
    mat.dispose();
    return shots;
  } catch (err) {
    console.warn('[CAD views] render skipped:', err instanceof Error ? err.message : String(err));
    return [];
  }
}
