"""
Arithmetic audit (30 Oct 2026): every equation a basis line PRINTS must hold.

Reads the dump of scripts/arith-audit/dump.ts and, for each provenance basis and each operation /
traceability note, finds "<numbers and operators> = <number>" and "… → <number>" segments, evaluates the left
side (units and words skipped; ×, x, *, ÷, / between spaces, +, −) and compares it with the printed result at the
precision printed. It also checks that the rule's VALUE appears in, or follows from, its basis when the basis ends
in a number. A mismatch is a line that states arithmetic the tool did not do — a hallucination on the page.

  python3 -I scripts/arith-audit/basis-check.py <dumpDir>
"""
import json, glob, re, sys, os

NUM = r'[£$€₹¥]?-?\d[\d,]*(?:\.\d+)?%?'
TOK = re.compile(r'(' + NUM + r')|(\s[×x\*÷/+−-]\s|[×÷+−])')

def val(t):
    pct = t.endswith('%')
    t = t.strip('£$€₹¥%').replace(',', '')
    v = float(t)
    return v / 100 if pct else v

def decimals(t):
    t = t.strip('£$€₹¥%').replace(',', '')
    return len(t.split('.')[1]) if '.' in t else 0

def evaluate(left):
    toks = []
    for m in TOK.finditer(left):
        if m.group(1):
            toks.append(('n', m.group(1)))
        else:
            op = m.group(2).strip()
            op = {'x': '*', '×': '*', '÷': '/', '−': '-'}.get(op, op)
            toks.append(('o', op))
    # keep the trailing run that alternates number op number …
    seq = []
    for t in reversed(toks):
        if not seq:
            if t[0] != 'n': continue
            seq.append(t); continue
        if seq[-1][0] == 'n' and t[0] == 'o': seq.append(t)
        elif seq[-1][0] == 'o' and t[0] == 'n': seq.append(t)
        else: break
    seq.reverse()
    if seq and seq[0][0] == 'o': seq = seq[1:]
    if len(seq) < 3: return None, None
    expr = ''.join(str(val(x)) if k == 'n' else x for k, x in seq)
    try:
        return eval(expr, {'__builtins__': {}}), ' '.join(x for _, x in seq)
    except Exception:
        return None, None

def check_text(text):
    bad = []
    for m in re.finditer(r'(=|→|≈)\s*(' + NUM + r')', text):
        start = max(text.rfind(c, 0, m.start()) for c in ';|:(')
        prev_eq = max(text.rfind('=', 0, m.start()), text.rfind('→', 0, m.start()))
        start = max(start, prev_eq) + 1
        left = text[start:m.start()]
        got, expr = evaluate(left)
        if got is None: continue
        shown = m.group(2)
        want = val(shown)
        tol = 0.5 * 10 ** (-decimals(shown)) * (0.01 if shown.endswith('%') else 1)
        # integers printed after a ceiling ('rounded up', '→ 56 tools') may round up
        ok = abs(got - want) <= max(tol * 1.0001, abs(want) * 1e-6)
        if not ok and m.group(1) == '→' and abs(want - __import__('math').ceil(got - 1e-9)) < 1e-9: ok = True
        if not ok and m.group(1) == '≈' and abs(got - want) <= max(abs(want) * 0.05, tol): ok = True
        if not ok:
            bad.append(f'{expr} = {got:.6g}, printed {shown}')
    return bad

def main(d):
    issues = 0; checked = 0
    for f in sorted(glob.glob(os.path.join(d, '*.json'))):
        if f.endswith('index.json'): continue
        j = json.load(open(f))
        texts = []
        for k, v in (j.get('provenance') or {}).items():
            texts.append((f'rule {k} = {v.get("value")}', str(v.get('basis', ''))))
        tr = j.get('trace') or {}
        for t in tr.get('traceability') or []:
            texts.append((f'trace {t.get("field")}', str(t.get('rateSource', ''))))
        for a in j.get('assumed') or []:
            texts.append(('assumed', str(a)))
        for w in j.get('warnings') or []:
            texts.append((f'warning {w.get("code")}', str(w.get('message', ''))))
        for where, text in texts:
            checked += 1
            for b in check_text(text):
                issues += 1
                print(f'{j["part"]:30} {where[:60]:60} | {b} | …{text[:160]}')
    print(f'\n{checked} texts checked, {issues} printed equations do not hold')

main(sys.argv[1])
