#!/bin/bash
# Deterministic arm over the real parts. Answers are the documented truth from
# docs/cad-to-cost-learnings.md — the material a person would give the tool.
cd "$(dirname "$0")/.." || exit 1
R=tests/fixtures/cad-parts/real
run() { echo; echo "######## $1"; AIR_GAPPED=1 npx tsx scripts/cost-from-cad.ts "$R/$1" "${@:2}" 2>&1 | grep -v '^Measuring'; }

run steering_knuckle_RH.stp --commodity casting --answer material.family=aluminium \
    --answer service.pressureTight=no --answer service.toleranceClass=standard --answer service.safetyCritical=yes
run Stub_Axle.stp --commodity forging --answer material.family=steel \
    --answer service.toleranceClass=standard --answer service.safetyCritical=yes
run Seat_LH_Cross_Member.stp --commodity sheet_metal --answer material.family=steel
run BUMPER.stp --commodity injection_moulding --answer material.resin=mat-pp-impact
run Fuel_tank.STEP --commodity blow_moulding --answer material.resin=mat-hdpe-blow --answer blow.capacityL=60 --answer blow.barrierWall=coex
run Casting_Braket.stp --commodity casting --answer material.family=aluminium \
    --answer service.pressureTight=no --answer service.toleranceClass=standard --answer service.safetyCritical=no
run Hood_Bracket.stp --commodity sheet_metal --answer material.family=steel
