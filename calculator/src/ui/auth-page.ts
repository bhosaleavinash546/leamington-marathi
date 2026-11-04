/**
 * auth.html's buttons, wired without inline handlers (the server's CSP blocks `onclick="…"` — see page-actions.ts).
 *
 * The page's own script (a classic script in auth.html) defines gotoView / togglePw / checkPwStrength / submitOTP /
 * resendOTP as globals; a module script runs after it, so they exist when a control is used.
 */
import { installPageActions, type PageActionHandler } from './page-actions.js';

type AuthGlobals = {
  gotoView?: (name: string) => void;
  togglePw?: (inputId: string, btn: HTMLElement) => void;
  checkPwStrength?: (pw: string, wrapperId: string) => void;
  submitOTP?: () => unknown;
  resendOTP?: () => unknown;
};

/** The actions auth.html names in `data-cv-action` / `data-cv-input`, each calling the page's own function. */
export function authPageHandlers(w: AuthGlobals): Record<string, PageActionHandler> {
  return {
    goto: el => { if (el.dataset.view) w.gotoView?.(el.dataset.view); },
    'toggle-pw': el => { if (el.dataset.target) w.togglePw?.(el.dataset.target, el); },
    'otp-submit': () => { void w.submitOTP?.(); },
    'otp-resend': () => { void w.resendOTP?.(); },
    'pw-strength': el => { w.checkPwStrength?.((el as HTMLInputElement).value, el.dataset.strength ?? ''); },
  };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  installPageActions(authPageHandlers(window as unknown as AuthGlobals));
}
