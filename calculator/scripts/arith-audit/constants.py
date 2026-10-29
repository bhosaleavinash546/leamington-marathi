"""
Arithmetic audit (30 Oct 2026): every numeric constant in a costing file, and whether it says where it comes from.

For each numeric literal in the costing code (rule packs, derive/, modules, advisors, the shared time / routing /
sizing files), look at its own line and the comment block above it for a stated basis: a URL, a named source
(standard, handbook, supplier, statistic), or an explicit label (ESTIMATE, engineering-typical, heuristic,
assumption, representative, judgement). A constant with neither is UNLABELLED — a number a reader cannot trace.
Trivial literals (0, 1, 2, 10, 100, 1000, 60, 3600, 1e3…, unit conversions, array indices) are skipped.

  python3 -I scripts/arith-audit/constants.py <file-or-dir> … [--list]
"""
import re, sys, os

SKIP = {0, 1, 2, 3, 4, 10, 100, 1000, 1e3, 1e4, 1e6, 1e-6, 1e-9, 60, 3600, 0.5, 1e9, 1e-3, 24, 365, 12}
LABEL = re.compile(r'https?://|source|sourced|estimate|engineering[- ]typical|heuristic|assum|representative|judgement|'
                   r'judgment|typical|handbook|nadca|asm |iso |en \d|din |astm|sae |boothroyd|dewhurst|roymech|desnz|'
                   r'ons |eurostat|lme|fastmarkets|supplier|quote|datasheet|catalogue|catalog|machinery|kalpakjian|'
                   r'schey|groover|swift|book|library|rate[- ]book|measured|stated|labelled|per the|according|'
                   r'(?:19|20)\d\d', re.I)
NUM = re.compile(r'(?<![\w.\'"`])(\d+(?:_\d+)*(?:\.\d+)?(?:e-?\d+)?)(?![\w.])')

def scan(path):
    lines = open(path, encoding='utf8').read().split('\n')
    out = []
    in_block = False
    for i, raw in enumerate(lines):
        s = raw.strip()
        if s.startswith('import ') or s.startswith('export type') or s.startswith('//') or s.startswith('*') or s.startswith('/*'):
            continue
        code = re.sub(r'//.*$', '', raw)
        code = re.sub(r"'[^']*'|\"[^\"]*\"|`[^`]*`", '""', code)   # numbers inside strings are text
        for m in NUM.finditer(code):
            try: v = float(m.group(1).replace('_', ''))
            except ValueError: continue
            if v in SKIP: continue
            ctx_start = max(0, i - 8)
            ctx = '\n'.join(lines[ctx_start:i + 2])
            labelled = bool(LABEL.search(ctx))
            out.append((i + 1, m.group(1), labelled, raw.strip()[:150]))
    return out

paths = [a for a in sys.argv[1:] if not a.startswith('--')]
listing = '--list' in sys.argv
files = []
for p in paths:
    if os.path.isdir(p):
        for root, _, fs in os.walk(p):
            files += [os.path.join(root, f) for f in fs if f.endswith('.ts') and not f.endswith('.test.ts')]
    else:
        files.append(p)
tot = unl = 0
for f in sorted(files):
    r = scan(f)
    u = [x for x in r if not x[2]]
    tot += len(r); unl += len(u)
    print(f'{len(r):5} constants  {len(u):4} unlabelled   {f}')
    if listing:
        for ln, n, _, src in u: print(f'      {f}:{ln}  {n:>10}  {src}')
print(f'\n{tot} constants, {unl} with no stated basis nearby')
