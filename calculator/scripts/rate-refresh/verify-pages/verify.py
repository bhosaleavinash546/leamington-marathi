#!/usr/bin/env python3
"""
Page check for rate research (30 Oct 2026, network open).

Every research figure in scripts/rate-refresh/*/research/*.json was read either on its page or — when the session's
proxy refused the page — from a search-result extract. This opens every cited URL and looks for the figure ON THE
PAGE. It never changes a figure: it writes a status a figure, and a person (or a verifier agent) decides.

  python3 -I scripts/rate-refresh/verify-pages/verify.py <cacheDir> [out.json] [--only <dir-glob>]

Status per item:
  value-on-page   the item's value (in any common number format) is in the page text
  basis-on-page   the value is derived, and at least half of the source figures its basis quotes are in the page text
  page-no-figure  the page opened but neither the value nor the quoted figures are in it (JS page, moved, or wrong)
  page-failed     the page did not open (HTTP error, timeout, refused)
  no-url          the item cites no URL (statute, engineering judgement, carried figure)
"""
import glob, hashlib, json, os, re, subprocess, sys, concurrent.futures as cf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else os.path.join(os.path.dirname(__file__), 'page-check.json')
ONLY = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else '*'
os.makedirs(CACHE, exist_ok=True)
URL_RE = re.compile(r'https?://[^\s;,)\]"\'<>]+')
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'


def urls_of(item):
    s = ' '.join(str(item.get(k, '')) for k in ('source', 'url', 'urls'))
    return [u.rstrip('.') for u in URL_RE.findall(s)]


def fetch(url):
    """Page text (cached by URL hash); '' when the page did not open."""
    h = hashlib.sha1(url.encode()).hexdigest()[:16]
    txt = os.path.join(CACHE, h + '.txt')
    rendered = os.path.join(CACHE, h + '.render.txt')   # the browser pass (render.mjs), when it ran
    extra = (' ' + open(rendered, encoding='utf-8', errors='replace').read()) if os.path.exists(rendered) else ''
    if os.path.exists(txt):
        return open(txt, encoding='utf-8', errors='replace').read() + extra
    raw = os.path.join(CACHE, h + '.raw')
    try:
        r = subprocess.run(['curl', '-sSL', '-m', '40', '--max-filesize', '40000000', '-A', UA, '-o', raw,
                            '-w', '%{http_code} %{content_type}', url], capture_output=True, text=True, timeout=60)
        code, _, ctype = r.stdout.partition(' ')
    except Exception:
        code, ctype = '000', ''
    text = ''
    if code.startswith('2') and os.path.exists(raw):
        data = open(raw, 'rb').read()
        try:
            if data[:5] == b'%PDF-' or 'pdf' in ctype:
                from pdfminer.high_level import extract_text
                text = extract_text(raw) or ''
            else:
                from bs4 import BeautifulSoup
                html = data.decode('utf-8', errors='replace')
                text = BeautifulSoup(html, 'html.parser').get_text(' ')
        except Exception:
            text = ''
    if os.path.exists(raw):
        os.remove(raw)
    text = re.sub(r'\s+', ' ', text)
    open(txt, 'w', encoding='utf-8').write(text)
    open(os.path.join(CACHE, h + '.meta'), 'w').write(json.dumps({'url': url, 'code': code, 'ctype': ctype}))
    return text


def forms(x):
    """Common printed forms of a number: 1234.5 → 1234.5, 1,234.5, 1 234,5, 1.234,5 …"""
    out = set()
    try:
        v = float(x)
    except (TypeError, ValueError):
        return out
    for dec in range(0, 4):
        s = f'{v:.{dec}f}'
        if dec and float(s) != round(v, dec):
            continue
        ip, _, fp = s.partition('.')
        neg = ip.startswith('-')
        ip = ip.lstrip('-')
        groups = re.sub(r'(?<=\d)(?=(\d{3})+$)', '|', ip).split('|')
        for th, dp in ((',', '.'), ('.', ','), (' ', ','), (' ', ','), ('', '.'), ('', ','), (' ', '.'), ("'", '.')):
            body = th.join(groups) + (dp + fp if fp else '')
            out.add(('-' if neg else '') + body)
    return {f for f in out if len(re.sub(r'\D', '', f)) >= 2}


def quoted_numbers(item):
    """Source figures the basis quotes (not the arithmetic's own small constants)."""
    s = str(item.get('basis', ''))
    nums = re.findall(r'(?<![\w.])\d{1,3}(?:[ ,. ]\d{3})+(?:[.,]\d+)?|(?<![\w.])\d+(?:[.,]\d+)?', s)
    keep = []
    for n in nums:
        d = re.sub(r'\D', '', n)
        if len(d) >= 3 and not re.fullmatch(r'20[12]\d', n):  # skip years
            keep.append(n)
    return keep[:12]


def on_page(text, number_strings):
    t = text
    for n in number_strings:
        if re.search(r'(?<![\d.,])' + re.escape(n) + r'(?![\d])', t):
            return True
    return False


def norm_variants(n):
    d = n.replace(' ', ' ')
    digits_only = re.sub(r'[^\d.,]', '', d)
    try:
        if re.fullmatch(r'\d{1,3}([ ,.]\d{3})+', d):
            v = float(re.sub(r'[ ,.]', '', d))
        else:
            v = float(digits_only.replace(',', '.')) if digits_only.count(',') + digits_only.count('.') <= 1 else None
    except ValueError:
        v = None
    s = {n}
    if v is not None:
        s |= forms(v)
    return s


def main():
    files = sorted(glob.glob(os.path.join(ROOT, ONLY, 'research', '*.json')))
    items = []
    for f in files:
        rel = os.path.relpath(f, ROOT)
        for i, it in enumerate(json.load(open(f)).get('items', [])):
            items.append((rel, i, it))
    all_urls = sorted({u for _, _, it in items for u in urls_of(it)})
    print(f'{len(items)} items, {len(all_urls)} URLs', flush=True)
    with cf.ThreadPoolExecutor(16) as ex:
        for k, _ in enumerate(ex.map(fetch, all_urls)):
            if k % 100 == 0:
                print(f'  fetched {k}/{len(all_urls)}', flush=True)
    res = []
    for rel, i, it in items:
        us = urls_of(it)
        r = {'file': rel, 'i': i, 'key': it.get('key'), 'value': it.get('value'), 'urls': us,
             'flagged': bool(it.get('verify')) or 'extract' in json.dumps(it).lower()}
        if not us:
            r['status'] = 'no-url'
        else:
            texts = [fetch(u) for u in us]
            opened = [t for t in texts if len(t) > 200]
            if not opened:
                r['status'] = 'page-failed'
            else:
                big = ' '.join(opened)
                if on_page(big, forms(it.get('value'))):
                    r['status'] = 'value-on-page'
                else:
                    q = quoted_numbers(it)
                    hit = [n for n in q if on_page(big, norm_variants(n))]
                    r['quoted'] = q
                    r['quotedOnPage'] = hit
                    r['status'] = 'basis-on-page' if q and len(hit) * 2 >= len(q) else 'page-no-figure'
        res.append(r)
    from collections import Counter
    c = Counter(r['status'] for r in res)
    cf_ = Counter(r['status'] for r in res if r['flagged'])
    print('all:', dict(c))
    print('flagged:', dict(cf_))
    json.dump({'checked': '2026-10-30', 'counts': dict(c), 'flaggedCounts': dict(cf_), 'items': res},
              open(OUT, 'w'), indent=1)


if __name__ == '__main__':
    main()
