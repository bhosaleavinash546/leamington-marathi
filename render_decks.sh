#!/usr/bin/env bash
# Render every deck to PDF so they can actually be looked at.
#
# This needs libreoffice-impress, which is NOT pulled in by libreoffice-core.
# Without it soffice reports "source file could not be loaded" for every .pptx
# — which reads like a corrupt file and is really a missing component. If the
# convert fails, run:  apt-get update && apt-get install -y libreoffice-impress
set -euo pipefail
OUT="${1:-/tmp/render}"
mkdir -p "$OUT"
for f in CostVision-Workflow-Explained CostVision-Agentic-AI-Management-Presentation \
         CostVision-Executive-Presentation CostVision-Implementation-Blueprint; do
  soffice --headless --convert-to pdf "$f.pptx" --outdir "$OUT" >/dev/null 2>&1
  printf '%-52s -> %s.pdf\n' "$f" "$OUT/$f"
done
