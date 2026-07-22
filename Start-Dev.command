#!/bin/bash
# Double-click this (macOS) to launch CostVision locally with the STEP-capable
# 3D viewer. It opens Terminal, sets up config, and runs the dev stack in the
# foreground so the sign-in OTP is visible. Stop with Ctrl-C.
cd "$(dirname "$0")" || exit 1
exec ./dev-start.sh
