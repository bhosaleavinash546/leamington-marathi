/**
 * Build the Windows package — a folder you copy to a laptop and double-click.
 *
 *   node scripts/package-windows.mjs [--out ..\CostVision-Windows] [--wheels DIR]
 *
 * RUN THIS ON WINDOWS x64. Two of the four pieces are platform-native and
 * cannot be produced anywhere else:
 *
 *   - better-sqlite3 and bcrypt compile or unpack to win32-x64 binaries. Both
 *     publish prebuilds, so `npm ci` fetches rather than compiles, but it must
 *     be an `npm ci` on Windows to fetch the right ones.
 *   - OCP is a 46 MB win_amd64 wheel with no source distribution.
 *
 * The output has no installer, needs no administrator rights, and writes
 * nothing outside itself and %LOCALAPPDATA%\CostVision:
 *
 *     CostVision-Windows\
 *       Start-CostVision.bat
 *       requirements.txt
 *       runtime\node\        portable Node
 *       runtime\python\      embedded Python with OCP installed
 *       app\                 the application, node_modules and dist built
 *
 * THE BUILD MACHINE NEEDS NETWORK; the target does not. For a build machine
 * that is itself offline, fetch the wheels elsewhere and pass --wheels:
 *
 *     pip download -r requirements.txt -d wheels --platform win_amd64 ^
 *         --python-version 312 --only-binary=:all:
 *
 * The script ends by measuring a real STEP fixture with the bundled Python and
 * comparing it against the committed truth value. A package that cannot measure
 * geometry is the failure worth catching here rather than on someone's desk,
 * and it is the same check CI runs against the Docker image.
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, cpSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '..');              // calculator/
const REPO = resolve(APP, '..');

// Pinned. A package built twice should be the same package, and Node's ABI is
// what the native modules below are fetched against.
const NODE_VERSION = '22.22.2';
const PYTHON_VERSION = '3.12.8';              // cp312 — OCP publishes a win_amd64 wheel
const NODE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
const PYTHON_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py';

// The fixture the finished package must measure, and what it must measure.
// From cad-audit/truth/block-2holes.json, taken with raw OCCT independently of
// the pipeline.
const FIXTURE = 'tests/fixtures/cad-parts/block-2holes.step';
const EXPECT_CM3 = 44.858;

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const OUT = resolve(flag('--out', join(REPO, 'CostVision-Windows')));
const WHEELS = flag('--wheels', null);
const FORCE = args.includes('--force');

const say = s => console.log(s);
const step = s => console.log(`\n── ${s}`);
const run = (cmd, cwd, opts = {}) =>
  execSync(cmd, { cwd, stdio: 'inherit', windowsHide: true, ...opts });

// ── Refuse to build a package that cannot work ───────────────────────────────
step('Checking the build machine');
if (process.platform !== 'win32' && !FORCE) {
  console.error(
    `\n  This is ${process.platform}, not Windows.\n\n`
    + '  npm would install this platform\'s better-sqlite3 and bcrypt binaries and\n'
    + '  the package would fail on the first request with a "not a valid Win32\n'
    + '  application" error — after it had been copied to someone\'s laptop.\n\n'
    + '  Build it on Windows x64. --force proceeds anyway, for testing the\n'
    + '  script itself; the result is not shippable.\n');
  process.exit(1);
}
if (process.arch !== 'x64' && !FORCE) {
  console.error(`\n  This is ${process.arch}. The wheels and prebuilds are x64.\n`);
  process.exit(1);
}
const major = Number(process.versions.node.split('.')[0]);
if (major !== Number(NODE_VERSION.split('.')[0])) {
  console.warn(`  ! Building with Node ${process.versions.node} but bundling ${NODE_VERSION}.\n`
    + '    Native modules are fetched for the ABI of the Node running npm, so\n'
    + '    these must match. Use the same major version.');
  if (!FORCE) process.exit(1);
}
say(`  ok  ${process.platform}-${process.arch}, Node ${process.versions.node}`);

if (existsSync(OUT)) {
  if (!FORCE) { console.error(`\n  ${OUT} already exists. Remove it, or pass --force.\n`); process.exit(1); }
  rmSync(OUT, { recursive: true, force: true });
}
mkdirSync(join(OUT, 'runtime'), { recursive: true });

// ── Runtimes ────────────────────────────────────────────────────────────────
// Expand-Archive rather than a zip library: it is in every Windows PowerShell
// and this script should not need dependencies of its own to build.
const fetchZip = (url, dest, name) => {
  const tmp = join(OUT, `${name}.zip`);
  say(`  fetching ${name} …`);
  run(`powershell -NoProfile -Command "Invoke-WebRequest -Uri '${url}' -OutFile '${tmp}' -UseBasicParsing"`, OUT);
  run(`powershell -NoProfile -Command "Expand-Archive -Path '${tmp}' -DestinationPath '${dest}' -Force"`, OUT);
  rmSync(tmp, { force: true });
};

step(`Node ${NODE_VERSION}`);
fetchZip(NODE_URL, join(OUT, 'runtime'), 'node');
// The zip expands to node-v<ver>-win-x64\ — flatten it to runtime\node\.
const nodeDir = join(OUT, 'runtime', `node-v${NODE_VERSION}-win-x64`);
if (existsSync(nodeDir)) { cpSync(nodeDir, join(OUT, 'runtime', 'node'), { recursive: true }); rmSync(nodeDir, { recursive: true, force: true }); }
say('  ok  runtime\\node');

step(`Python ${PYTHON_VERSION} (embeddable)`);
const PY_DIR = join(OUT, 'runtime', 'python');
fetchZip(PYTHON_URL, PY_DIR, 'python');
// The embeddable build ships a `._pth` that pins sys.path and leaves `import
// site` commented out, so pip installs land somewhere nothing can import them.
// Adding site-packages and re-enabling site is the documented way to make the
// embeddable distribution usable as a real interpreter.
const pth = readdirSync(PY_DIR).find(f => /^python\d+\._pth$/.test(f));
if (!pth) { console.error('  ! no python*._pth in the embeddable zip — layout changed'); process.exit(1); }
const pthPath = join(PY_DIR, pth);
let pthText = readFileSync(pthPath, 'utf8');
if (!pthText.includes('Lib\\site-packages')) pthText += '\nLib\\site-packages\n';
pthText = pthText.replace(/^#\s*import site\s*$/m, 'import site');
if (!/^import site\s*$/m.test(pthText)) pthText += '\nimport site\n';
writeFileSync(pthPath, pthText);
say(`  ok  ${pth} patched for site-packages`);

const PY = join(PY_DIR, 'python.exe');
step('pip, then the geometry kernel');
if (WHEELS) {
  say(`  offline: installing from ${WHEELS}`);
  run(`"${PY}" -m ensurepip --default-pip`, OUT, { stdio: 'pipe' });
  run(`"${PY}" -m pip install --no-index --find-links "${resolve(WHEELS)}" -r "${join(REPO, 'requirements.txt')}"`, OUT);
} else {
  const getPip = join(OUT, 'get-pip.py');
  run(`powershell -NoProfile -Command "Invoke-WebRequest -Uri '${GET_PIP_URL}' -OutFile '${getPip}' -UseBasicParsing"`, OUT);
  run(`"${PY}" "${getPip}" --no-warn-script-location`, OUT);
  rmSync(getPip, { force: true });
  run(`"${PY}" -m pip install --no-warn-script-location -r "${join(REPO, 'requirements.txt')}"`, OUT);
}
execFileSync(PY, ['-c', 'import OCP; print("  ok  OCP imports")'], { stdio: 'inherit' });

// ── The application ─────────────────────────────────────────────────────────
step('Application');
// A clean production tree: `npm ci` so the lockfile decides, `--omit=dev` so
// vite, vitest and playwright do not ship to a laptop that only runs the app.
run('npm ci --omit=dev', APP);
// The build needs devDependencies, so build first from the full tree, then
// prune. Doing it the other way round leaves no vite to build with.
run('npm ci', APP);
run('npm run build', APP);
run('npm prune --omit=dev', APP);

const SKIP = new Set(['node_modules/.cache', '.git', 'data', 'coverage', 'e2e', '.env']);
cpSync(APP, join(OUT, 'app'), {
  recursive: true,
  filter: src => {
    const rel = src.slice(APP.length + 1).replace(/\\/g, '/');
    return !rel || ![...SKIP].some(s => rel === s || rel.startsWith(`${s}/`));
  },
});
cpSync(join(REPO, 'Start-CostVision.bat'), join(OUT, 'Start-CostVision.bat'));
cpSync(join(REPO, 'requirements.txt'), join(OUT, 'requirements.txt'));
say('  ok  app\\, launcher, requirements');

// ── Prove it measures geometry ──────────────────────────────────────────────
step('Verifying the package measures a real STEP file');
const out = execFileSync(PY, [join(OUT, 'app', 'server', 'utils', 'cad-geometry-engine.py'),
                              join(OUT, 'app', ...FIXTURE.split('/'))],
                         { encoding: 'utf8', maxBuffer: 64 << 20 });
const geo = JSON.parse(out);
if (geo.status !== 'success') { console.error(`  FAILED: ${geo.error ?? geo.status}`); process.exit(1); }
const cm3 = geo.volume?.cm3;
const errPct = Math.abs(cm3 - EXPECT_CM3) / EXPECT_CM3 * 100;
if (!(errPct < 0.01)) {
  console.error(`  FAILED: measured ${cm3} cm3, expected ${EXPECT_CM3} (${errPct.toFixed(3)}% out)`);
  process.exit(1);
}
say(`  ok  ${cm3} cm3 against a truth of ${EXPECT_CM3} — ${geo.faces?.total} B-rep faces`);

// ── Footprint ───────────────────────────────────────────────────────────────
const sizeOf = p => {
  let n = 0;
  for (const e of readdirSync(p, { withFileTypes: true })) {
    const f = join(p, e.name);
    n += e.isDirectory() ? sizeOf(f) : statSync(f).size;
  }
  return n;
};
const gb = n => `${(n / 1e9).toFixed(2)} GB`;
step('Done');
for (const part of ['runtime\\node', 'runtime\\python', 'app']) {
  say(`  ${part.padEnd(16)} ${gb(sizeOf(join(OUT, ...part.split('\\'))))}`);
}
say(`  ${'TOTAL'.padEnd(16)} ${gb(sizeOf(OUT))}`);
say(`\n  ${OUT}\n\n  Copy that folder to the laptop and double-click Start-CostVision.bat.\n`);
