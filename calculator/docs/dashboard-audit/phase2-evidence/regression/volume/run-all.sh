#!/bin/bash
# Phase 2 · Step 5 volume runs (evidence script). From calculator/: bash docs/dashboard-audit/phase2-evidence/regression/volume/run-all.sh
# Each configuration 3 times; UX extras only on run 1. Fixed tree = cwd (fresh build); pre-fix = /tmp/cv-phase2-prefix/calculator.
set -u
V=docs/dashboard-audit/phase2-evidence/regression/volume
export PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium
run() { # label tree seed n i
  local ux=0; [ "$5" = 1 ] && ux=1
  echo "$(date +%T) start $1 n=$4 run $5" >> $V/run-all.log
  CV_ROOT=$2 SEED_COSTINGS=$3 UX=$ux timeout 1200 npx tsx $V/perf.ts $4 $V/$1-$4-run$5.json > $V/$1-$4-run$5.log 2>&1
  echo "$(date +%T) end $1 n=$4 run $5 exit $?" >> $V/run-all.log
}
for n in 20000 50000; do for i in 1 2 3; do run after-plain . 0 $n $i; done; done
for n in 20000 50000; do for i in 1 2 3; do run after-seeded . 1 $n $i; done; done
for n in 20000 50000; do for i in 1 2 3; do run prefix-plain /tmp/cv-phase2-prefix/calculator 0 $n $i; done; done
for n in 20000 50000; do for i in 1 2 3; do run prefix-seeded /tmp/cv-phase2-prefix/calculator 1 $n $i; done; done
echo "$(date +%T) ALL DONE" >> $V/run-all.log
