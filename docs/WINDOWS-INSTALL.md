# CostVision on a Windows laptop

For a locked-down machine with no administrator rights. The deterministic cost
engine, the CAD-to-Cost pipeline and bulk costing all run offline; AI features
appear only once an API key is added (they need internet access to the API).

AI is **not air-gapped**. Until an API key is added the AI screens are hidden
and every costing path works without them. To switch AI on, put
`ANTHROPIC_API_KEY=<key>` in `%LOCALAPPDATA%\CostVision\settings.env` (the
launcher writes the line, commented) and restart. To switch AI off
deliberately — every model call then refuses, even with a key — uncomment
`AIR_GAPPED=1` in the same file.

---

## What the user does

1. Copy the `CostVision-Windows` folder to the laptop — anywhere they can write,
   `Documents` is fine.
2. Double-click **`Start-CostVision.bat`**.
3. The browser opens on `http://localhost:3002/calculator/`.

No installer, no admin rights, no network. The first run writes a settings file
and a database to `%LOCALAPPDATA%\CostVision` and takes a few seconds longer
than later ones.

To stop it, close the window titled *CostVision server*.

---

## What is in the package

```
CostVision-Windows\
  Start-CostVision.bat        the launcher
  requirements.txt            the pinned geometry kernel
  runtime\node\               portable Node 22 — not installed, not on PATH
  runtime\python\             embedded Python 3.12 with OCP already in it
  app\                        the application, node_modules and dist prebuilt
```

Nothing is installed. Deleting the folder removes the application; deleting
`%LOCALAPPDATA%\CostVision` removes the data with it.

**Roughly 1.5–2 GB on disk**, most of it the OCCT geometry kernel (~160 MB
unpacked) and `node_modules`. Measure the real figure from the packaging
script's output rather than quoting this.

---

## Building the package

Run on **Windows x64, Node 22**, on a machine with network. The target laptop
needs neither.

```
cd calculator
node scripts\package-windows.mjs
```

It fetches portable Node and embedded Python, installs the kernel wheel,
builds the app, prunes the dev dependencies, and then **measures a real STEP
fixture with the bundled interpreter** and fails if the answer is not the
committed truth value. A package that cannot measure geometry does not get
built — the same check CI runs against the Docker image.

### Why it has to be Windows

Two pieces are platform-native and cannot be produced elsewhere:

- `better-sqlite3` and `bcrypt` resolve to `win32-x64` binaries. Both publish
  prebuilds, so `npm ci` downloads rather than compiles — but it has to be an
  `npm ci` **on Windows** to fetch the right ones. Build on Linux and the
  laptop fails on the first request with *"not a valid Win32 application"*.
- OCP ships as a 46 MB `win_amd64` wheel with no source distribution.

The script refuses to run on another platform rather than produce a folder that
looks finished and is not.

### If the build machine is also offline

Fetch the wheels somewhere with network and carry them over:

```
pip download -r requirements.txt -d wheels --platform win_amd64 ^
    --python-version 312 --only-binary=:all:

node scripts\package-windows.mjs --wheels wheels
```

`npm ci` still needs network on the build machine — the prebuilds come from
GitHub. There is no offline path for that other than copying a `node_modules`
built elsewhere on Windows.

---

## What the launcher sets, and why

| Variable | Value | Why |
|---|---|---|
| `AIR_GAPPED` | not set (commented `# AIR_GAPPED=1` in settings.env) | Uncomment to switch AI off: every model call throws `AirGappedError`, enforced by `tests/architecture-invariants.test.ts`. Unset, AI runs once `ANTHROPIC_API_KEY` is set and stays hidden until then. |
| `CV_DATA_DIR` | `%LOCALAPPDATA%\CostVision` | A standard user cannot write under `C:\Program Files`, and the database is opened on the first request. Also survives a reinstall. |
| `PYTHON_BIN` | the bundled `python.exe` | `geometry-bridge.ts` spawns `python3` by default, and there is no `python3` on Windows. |
| `JWT_SECRET` | generated on first run | A secret baked into a package everyone installs is not a secret. |
| `NODE_ENV` | `production` | Serves the built `dist` so one URL covers the whole app. |

---

## Checking it works

**The app is running.** The browser opens on the dashboard. If it does not,
`http://localhost:3002/api/health` answers.

**The geometry kernel is live.** Upload a STEP file on the CAD-to-Cost screen.
A working kernel reports a true volume, a surface area and a B-rep feature
table with holes and their diameters, and the badge reads `OCCT KERNEL`. If
Python or OCP is missing the launcher says so on startup, STL still costs
normally, and STEP reports an error rather than quietly guessing.

**AI really is off.** The startup banner says `AIR-GAPPED — all external
AI/news/pricing calls disabled`. The CAD screen's analysis mode is
*Rules only — no AI call*, which is the default in both the UI and the server.

---

## Known gaps

- **Never yet run on a JLR laptop.** Everything here is verified on Linux,
  under a simulated Windows Python, or by reading the published artefacts for
  Windows. The packaging script's own verification step is the first thing that
  would run on real hardware.
- **The CAD screen still shows AI controls** — an "Analysis mode" dropdown with
  AI options, a "Claude API Key" field and a Deep-analysis checkbox. Choosing
  one throws. The server does not yet tell the UI it is air-gapped, so nothing
  greys them out.
- **No group policy / MSI / code-signing story.** This is a folder that runs
  from a user profile. If JLR IT requires a signed installer, that is separate
  work.
