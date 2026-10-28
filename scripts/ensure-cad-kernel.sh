# Sourced by start.sh and dev-start.sh (not run): find or install the CAD kernel and export PYTHON_BIN.
#
# STEP / IGES are read by server/utils/cad-geometry-engine.py, which imports OCP (the OpenCASCADE bindings) — not
# cadquery. The launchers used to test `import cadquery`, so they warned on a machine that HAD the kernel and told
# people to install the wrong package; on a Mac without it every STEP upload showed "No model loaded"
# (CAD to COST 360 review, Oct 2026).
#
# Order: an explicit PYTHON_BIN → python3 → the install's own venv (calculator/.venv-cad) → create that venv and
# `pip install -r requirements.txt` into it. OCP wheels exist for CPython 3.10–3.13 only, so the venv is made with the
# first of those it finds. Never fatal: without the kernel the app still starts and STL still works.

_cv_has_ocp() { "$1" -c "import OCP" >/dev/null 2>&1; }

_cv_root="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
_cv_venv="$_cv_root/calculator/.venv-cad"
_cv_kernel=""

if [ -n "${PYTHON_BIN:-}" ] && _cv_has_ocp "$PYTHON_BIN"; then
  _cv_kernel="$PYTHON_BIN"
elif command -v python3 >/dev/null 2>&1 && _cv_has_ocp python3; then
  _cv_kernel="python3"
elif [ -x "$_cv_venv/bin/python" ] && _cv_has_ocp "$_cv_venv/bin/python"; then
  _cv_kernel="$_cv_venv/bin/python"
elif [ "${CV_SKIP_KERNEL_INSTALL:-}" != "1" ]; then
  _cv_py=""
  for c in python3.12 python3.11 python3.13 python3.10 python3; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,13) else 1)' 2>/dev/null; then
      _cv_py="$c"; break
    fi
  done
  if [ -n "$_cv_py" ]; then
    echo "  📦 Installing the CAD kernel (OCP) for STEP / IGES into calculator/.venv-cad (first run, ~1–2 min)…"
    if "$_cv_py" -m venv "$_cv_venv" >/dev/null 2>&1 \
       && "$_cv_venv/bin/python" -m pip install --quiet --upgrade pip >/dev/null 2>&1 \
       && "$_cv_venv/bin/python" -m pip install --quiet -r "$_cv_root/requirements.txt" \
       && _cv_has_ocp "$_cv_venv/bin/python"; then
      _cv_kernel="$_cv_venv/bin/python"
    fi
  fi
fi

if [ -n "$_cv_kernel" ]; then
  export PYTHON_BIN="$_cv_kernel"
  echo "  ✅ CAD kernel found ($PYTHON_BIN) — STEP / IGES open in 3D and are measured"
else
  echo "  ⚠️  CAD kernel (OCP) not found — STEP / IGES cannot be read (STL files still work)."
  echo "     Fix: install Python 3.10–3.13, then   pip install -r requirements.txt   and restart."
  echo "     Or run the container instead:  docker compose up --build"
fi
unset _cv_root _cv_venv _cv_kernel _cv_py
