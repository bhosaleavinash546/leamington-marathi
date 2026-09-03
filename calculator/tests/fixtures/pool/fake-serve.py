#!/usr/bin/env python3
"""A stand-in for cad-geometry-engine.py --serve: same JSON-lines protocol,
no OCP. Ops: 'echo' (returns the job), 'sleep' (ms), 'crash' (exit 3), 'hang'
(ignore alarm, block forever) — enough to exercise the pool's contracts."""
import sys, json, os, time
sys.stdout = sys.stderr
out = os.fdopen(1, 'w')
print(json.dumps({"ready": True, "pid": os.getpid()}), file=out, flush=True)
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    job = json.loads(line)
    op = job.get("op")
    if op == "crash":
        os._exit(3)
    if op == "hang":
        while True:
            time.sleep(1)
    if op == "sleep":
        time.sleep(float(job.get("ms", 100)) / 1000)
    res = {"status": "success", "echo": {k: v for k, v in job.items() if k != "id"}, "pid": os.getpid()}
    print(json.dumps({"id": job.get("id"), "result": res}), file=out, flush=True)
