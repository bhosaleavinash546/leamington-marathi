/**
 * P0 (CAD to COST fresh review, Nov 2026): sign-up was blocked in production. The server's CSP (helmet's default
 * `script-src-attr 'none'`) blocks inline event handler attributes, and "Create a free account" and the OTP
 * "Verify Code" on auth.html were `onclick="…"`. No served page, and no HTML a script draws, may carry one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inlineHandlers, installPageActions } from '../src/ui/page-actions.js';
import { authPageHandlers } from '../src/ui/auth-page.js';

function files(dir: string, ext: RegExp): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...files(p, ext));
    else if (ext.test(f)) out.push(p);
  }
  return out;
}

describe('no inline event handlers (the CSP blocks them)', () => {
  it('the regex finds what the CSP blocks', () => {
    expect(inlineHandlers('<button type="button" onclick="submitOTP()">Verify</button>')).toHaveLength(1);
    expect(inlineHandlers('<input oninput="checkPwStrength(this.value)" />')).toHaveLength(1);
    expect(inlineHandlers('<div\n onmouseenter="x()" >')).toHaveLength(1);
    // property assignment in a script and prose are not attributes
    expect(inlineHandlers('d.onclick=function(){ go(1); };')).toHaveLength(0);
    expect(inlineHandlers('<!-- not by inline onclick: the CSP blocks them -->')).toHaveLength(0);
  });

  it('no served HTML page has one (index.html, auth.html, public/**)', () => {
    const pages = ['index.html', 'auth.html', ...files('public', /\.html$/)];
    const hits = pages.flatMap(p => inlineHandlers(readFileSync(p, 'utf8')).map(h => `${p}: ${h}`));
    expect(hits).toEqual([]);
  });

  it('no HTML drawn by a script has one (src/**/*.ts template strings)', () => {
    const hits = files('src', /\.ts$/).flatMap(p => inlineHandlers(readFileSync(p, 'utf8')).map(h => `${p}: ${h}`));
    expect(hits).toEqual([]);
  });

  it('the server keeps the CSP that blocks them (helmet default script-src-attr)', () => {
    const srv = readFileSync('server/index.ts', 'utf8');
    expect(srv).toMatch(/helmet\(\{\s*contentSecurityPolicy/);
    expect(srv).not.toMatch(/scriptSrcAttr/);
  });
});

describe('auth.html is wired by a module', () => {
  const html = readFileSync('auth.html', 'utf8');
  it('loads the module and names every action it uses', () => {
    expect(html).toMatch(/<script type="module" src="\/src\/ui\/auth-page\.ts"><\/script>/);
    const handlers = authPageHandlers({});
    const named = [...html.matchAll(/data-cv-(?:action|input)="([^"]+)"/g)].map(m => m[1]);
    expect(named).toEqual(expect.arrayContaining(['goto', 'otp-submit', 'otp-resend', 'toggle-pw', 'pw-strength']));
    for (const n of named) expect(handlers[n], n).toBeTypeOf('function');
    // "Create a free account" and "Verify Code" — the two that blocked sign-up
    expect(html).toMatch(/data-cv-action="goto" data-view="signup"/);
    expect(html).toMatch(/id="btn-verify" data-cv-action="otp-submit"/);
    // the functions the actions call are the page's own
    for (const fn of ['gotoView', 'togglePw', 'checkPwStrength', 'submitOTP', 'resendOTP']) {
      expect(html).toMatch(new RegExp(`function ${fn}\\(`));
    }
  });

  it('a click runs the page function the control names; an input runs on input', () => {
    const calls: string[] = [];
    const handlers = authPageHandlers({
      gotoView: v => calls.push(`goto:${v}`), submitOTP: () => calls.push('otp'), resendOTP: () => calls.push('resend'),
      togglePw: id => calls.push(`pw:${id}`), checkPwStrength: (v, w) => calls.push(`strength:${v}:${w}`),
    });
    // a minimal event target: delegation reads `closest` and the dataset
    const listeners: Record<string, (e: Event) => void> = {};
    const root = { addEventListener: (t: string, f: (e: Event) => void) => { listeners[t] = f; }, removeEventListener: () => {} };
    const elOf = (tag: string, data: Record<string, string>, value = '') => {
      const el = { tagName: tag, dataset: data, value, closest: (sel: string) => (sel.includes('cv-action') && data.cvAction) || (sel.includes('cv-input') && data.cvInput) ? el : null };
      return el;
    };
    installPageActions(handlers, root as unknown as Document);
    let prevented = false;
    const ev = (target: unknown) => ({ target, preventDefault: () => { prevented = true; } }) as unknown as Event;
    listeners.click(ev(elOf('BUTTON', { cvAction: 'goto', view: 'signup' })));
    listeners.click(ev(elOf('BUTTON', { cvAction: 'otp-submit' })));
    listeners.click(ev(elOf('A', { cvAction: 'goto', view: 'signin' })));
    expect(prevented).toBe(true);   // a link used as a button does not navigate
    listeners.input(ev(elOf('INPUT', { cvInput: 'pw-strength', strength: 'signup-pw-strength' }, 'Abc12345!')));
    expect(calls).toEqual(['goto:signup', 'otp', 'goto:signin', 'strength:Abc12345!:signup-pw-strength']);
  });
});
