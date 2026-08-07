/**
 * End-to-end proof of the background DFM job, exercised the way the CAD upload
 * exercises it: an in-memory buffer, queued, drained, read back.
 *
 * The audit before the management demo found that the job could only be driven
 * by a file PATH, while the upload route uses multer memoryStorage and never
 * writes one — so the "runs in the background" feature was undriveable from the
 * only route that would ever call it. This script is the regression guard for
 * that: if it passes, the path a real upload takes works.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { queueDFMJobFromBuffer, getDFMJob, drain } from '../server/utils/dfm-job-runner.js';

const UP = process.env.CV_UPLOAD_DIR
  ?? '/root/.claude/uploads/8bf32d1a-7485-5bd6-9947-7843ee6c5644';

const CASES = [
  { file: `${UP}/d8d13088-steering_knuckle_RH.stp`, commodity: 'casting', process: 'gravity',
    material: 'aluminium', label: 'RH steering knuckle' },
  { file: 'tests/fixtures/cad-parts/flange-6holes-boss.step', commodity: 'machining',
    material: 'aluminium', label: 'flange fixture' },
] as const;

let failures = 0;
const check = (ok: boolean, what: string, detail = '') => {
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

async function main() {
  for (const c of CASES) {
    console.log(`\n=== ${c.label} (${c.commodity})`);
    if (!existsSync(c.file)) { console.log('   SKIP — file not present'); continue; }

    const buf = await readFile(c.file);
    const id = await queueDFMJobFromBuffer(buf, c.file.split('/').pop()!, {
      commodity: c.commodity, materialFamily: c.material,
      process: 'process' in c ? c.process : undefined,
    });
    check(!!id, 'job queued from an in-memory buffer');

    // queueDFMJob kicks drain(); await it so this script is deterministic.
    await drain();

    const job = getDFMJob(id);
    check(job !== null, 'job row readable');
    check(job?.status === 'done', 'job completed', `status=${job?.status} err=${job?.error ?? '-'}`);

    const r = job?.result;
    check(!!r, 'result parsed back out of SQLite');
    if (!r) continue;

    check(r.packAvailable === true, 'pack was available');
    check(Array.isArray(r.grouped) && r.grouped.length > 0,
      'grouped issues present', `${r.grouped?.length ?? 0} issues / ${r.findings.length} instances`);
    check(r.findings.every(f => f.faceIds.length > 0), 'every finding names its faces');
    check(r.findings.every(f => (f.source?.standard ?? '').length > 10),
      'every finding carries a citation');
    check(r.limitations.length > 0, 'limitations stated', `${r.limitations.length}`);
    check(r.dfa?.available === true, 'DFA computed',
      `${r.dfa?.totalTimeSec}s (${r.dfa?.vsIdealRatio}x ideal)`);

    // The temp file the queue created must be gone — a leak would fill /tmp on
    // a machine costing parts all day.
    const row = getDFMJob(id);
    check(row?.status === 'done', 'terminal state persisted');

    for (const g of (r.grouped ?? []).slice(0, 3)) {
      console.log(`      [${g.severity}] ${g.title} x${g.count} `
        + `(${g.range.min}-${g.range.max}${g.range.unit} vs ${g.threshold.comparator}${g.threshold.value})`);
    }
  }

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
