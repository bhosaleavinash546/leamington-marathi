/**
 * The things that stop this running on a Windows laptop.
 *
 * None of these can be caught by running the app on Linux or in the container,
 * which is exactly why they survived: the code is fine everywhere it is
 * currently exercised. What is asserted here is either portable behaviour we
 * can reproduce (a Python with no SIGALRM is a Python with no SIGALRM, whatever
 * the OS), or a property of the package we ship.
 *
 * The one thing these cannot do is prove the package runs. That needs a Windows
 * machine and `scripts/package-windows.mjs`, which measures a STEP fixture
 * inside the finished bundle and fails the build if it cannot.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const APP = resolve(__dirname, '..');
const REPO = resolve(APP, '..');
const ENGINE = join(APP, 'server', 'utils', 'cad-geometry-engine.py');

describe('the geometry engine runs on a Python without SIGALRM', () => {
  // `signal.SIGALRM` and `signal.alarm` are POSIX-only. Deleting both is what a
  // Windows interpreter looks like from the engine's point of view, and it
  // reproduces the failure exactly: the module used to raise AttributeError at
  // import, before a single line of geometry ran.
  const harness = `
import signal, sys, runpy
for a in ('SIGALRM', 'alarm'):
    if hasattr(signal, a): delattr(signal, a)
assert not hasattr(signal, 'SIGALRM')
runpy.run_path(sys.argv[1], run_name='not_main')
print('IMPORT_OK')
`;

  it('imports with the alarm API removed', () => {
    let out: string;
    try {
      out = execFileSync('python3', ['-c', harness, ENGINE], { encoding: 'utf8', timeout: 60_000 });
    } catch (e) {
      const err = e as { stderr?: string; code?: string };
      if (err.code === 'ENOENT') { console.log('[windows-package] no python3 — skipping'); return; }
      throw new Error(`the engine failed to import without SIGALRM:\n${err.stderr}`);
    }
    expect(out).toContain('IMPORT_OK');
  });

  it('has no bare signal.alarm call left to trip over', () => {
    const src = readFileSync(ENGINE, 'utf8');
    // One occurrence, inside the `_HAS_ALARM` guard in `_set_alarm`. Any other
    // is a call site that would raise on Windows.
    const calls = src.match(/signal\.alarm\(/g) ?? [];
    expect(calls.length, 'signal.alarm belongs only inside _set_alarm').toBe(1);
    expect(src).toMatch(/_HAS_ALARM = hasattr\(signal, "SIGALRM"\)/);
  });
});

describe('the database can live where the user can write', () => {
  it('honours CV_DATA_DIR', () => {
    // On Windows the install folder is typically read-only for the user running
    // it, and the database is opened on the first request — so this is the
    // difference between the app starting and SQLITE_CANTOPEN.
    const dir = mkdtempSync(join(tmpdir(), 'cv-data-'));
    try {
      const out = execFileSync('npx', ['tsx', '-e', "import(process.env.CV_DB_ENTRY!).then(()=>console.log('DB_OK'))"], {
        cwd: APP, encoding: 'utf8', timeout: 120_000,
        env: { ...process.env, CV_DATA_DIR: dir, JWT_SECRET: 'test-secret-for-data-dir', CV_DB_ENTRY: join(APP, 'server', 'db.ts') },
      });
      expect(out).toContain('DB_OK');
      expect(existsSync(join(dir, 'should-cost.db')), 'the database should be in CV_DATA_DIR').toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 130_000);
});

describe('the package does not need a compiler or a download at install time', () => {
  const pkg = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>; devDependencies: Record<string, string>; engines?: Record<string, string>;
  };

  it('does not ship puppeteer, whose postinstall downloads a browser', () => {
    // Nothing in the repo imports it — e2e drives Playwright. Its install step
    // fetches ~150 MB of Chromium from storage.googleapis.com, which on an
    // offline laptop is not slow, it is a failed install.
    expect(pkg.dependencies).not.toHaveProperty('puppeteer');
    expect(pkg.devDependencies).not.toHaveProperty('puppeteer');
  });

  it('keeps the mobile shell out of the runtime dependencies', () => {
    for (const k of ['@capacitor/android', '@capacitor/ios', '@capacitor/cli', '@capacitor/core']) {
      expect(pkg.dependencies, `${k} is build tooling, not a runtime dependency`).not.toHaveProperty(k);
    }
  });

  it('pins the Node major the native modules are fetched for', () => {
    // better-sqlite3 and bcrypt resolve prebuilds by ABI. Without a stated
    // engine, a laptop on a different major silently compiles instead — and
    // then needs Visual Studio Build Tools, which it will not have.
    expect(pkg.engines?.node).toBeTruthy();
    expect(pkg.engines!.node).toMatch(/22/);
  });
});

describe('the geometry kernel is pinned to what it was measured with', () => {
  const req = readFileSync(join(REPO, 'requirements.txt'), 'utf8');

  it('pins cadquery-ocp-novtk exactly', () => {
    // An OCCT minor bump has broken this before: OCP 8.0 moved TopoDS.Face_s to
    // Face and removed TopTools_IndexedMapOfShape, which is the face-id join key.
    expect(req).toMatch(/^cadquery-ocp-novtk==\d+\.\d+\.\d+\.\d+\.\d+$/m);
  });

  it('does not install cadquery, which the engine does not import', () => {
    // The engine is pure OCP — `_ShapeWrapper` exists precisely to drop it.
    const engine = readFileSync(ENGINE, 'utf8');
    expect(engine).not.toMatch(/^\s*(import cadquery|from cadquery)/m);
    expect(req.split('\n').filter(l => l.trim() && !l.startsWith('#')).join('\n'))
      .not.toMatch(/^cadquery==/m);
  });
});

describe('the Windows launcher and the code agree', () => {
  const bat = readFileSync(join(REPO, 'Start-CostVision.bat'), 'utf8');

  it('sets the variables the code actually reads', () => {
    // PYTHON_BIN because there is no `python3` on Windows; CV_DATA_DIR because
    // the install folder is not writable. Both are read in the app — if either
    // name changes, this test is the thing that notices.
    expect(bat).toMatch(/set "PYTHON_BIN=/);
    expect(bat).toMatch(/CV_DATA_DIR/);
    expect(readFileSync(join(APP, 'server', 'utils', 'geometry-bridge.ts'), 'utf8'))
      .toContain('process.env.PYTHON_BIN');
    expect(readFileSync(join(APP, 'server', 'db.ts'), 'utf8')).toContain('CV_DATA_DIR');
  });

  it('turns AI off provably rather than just leaving it unconfigured', () => {
    // An absent key is not the same claim as "this deployment cannot call out".
    // AIR_GAPPED=1 makes createAnthropic throw.
    expect(bat).toMatch(/AIR_GAPPED=1/);
  });

  it('has CRLF line endings, or cmd.exe mis-parses it', () => {
    // Batch is parsed by bytes. With LF-only endings cmd.exe can fail to find a
    // `goto` label — and this launcher is built on labels (:wait, :up, :die,
    // :done), so it would not run at all. It was written LF-only; .gitattributes
    // now pins eol=crlf so a checkout on Windows, or a contributor with
    // core.autocrlf=input, cannot quietly undo it.
    const raw = readFileSync(join(REPO, 'Start-CostVision.bat'));
    const crlf = raw.toString('binary').split('\r\n').length - 1;
    const lf = raw.toString('binary').split('\n').length - 1;
    expect(crlf, 'every line must end CRLF').toBe(lf);
    expect(lf).toBeGreaterThan(50);
  });

  it('is pinned to CRLF by .gitattributes', () => {
    const attrs = readFileSync(join(REPO, '.gitattributes'), 'utf8');
    expect(attrs).toMatch(/^\*\.bat\s+text\s+eol=crlf/m);
    // The CAD fixtures must NOT be line-ending normalised — rewriting bytes in
    // a STEP file changes a measured volume, or breaks it outright.
    for (const ext of ['step', 'stp', 'stl']) {
      expect(attrs, `*.${ext} should be binary`).toMatch(new RegExp(`^\\*\\.${ext}\\s+binary`, 'm'));
    }
  });

  it('generates the signing secret on the machine instead of shipping one', () => {
    expect(bat).toMatch(/randomBytes\(32\)/);
    expect(bat).not.toMatch(/JWT_SECRET=[A-Za-z0-9]{16,}/);
  });
});
