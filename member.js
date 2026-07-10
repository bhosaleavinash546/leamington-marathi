/* Membership sign-in for a static site: Firebase Authentication, loaded on
   demand from Google's CDN. Until member-config.js is filled in, the page
   shows a friendly "launching soon" note instead of broken forms. */
(async () => {
  const $ = id => document.getElementById(id);
  const cfg = window.LM_FIREBASE_CONFIG;

  if (!cfg || !cfg.apiKey || cfg.apiKey.includes('PASTE')) {
    $('member-setup').hidden = false;
    return;
  }

  let fb; // firebase auth module + instances
  try {
    const [appMod, authMod] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    ]);
    const app = appMod.initializeApp(cfg);
    fb = { ...authMod, auth: authMod.getAuth(app) };
    fb.auth.languageCode = 'en';
  } catch {
    $('member-offline').hidden = false;
    return;
  }

  const msg = $('auth-msg');
  const say = (text, isError) => {
    msg.textContent = text;
    msg.classList.toggle('error', !!isError);
    msg.hidden = !text;
  };

  // Firebase error codes → friendly words
  const FRIENDLY = {
    'auth/email-already-in-use': 'An account with this email already exists — try signing in instead.',
    'auth/invalid-email': 'That email address doesn’t look right — please check it.',
    'auth/weak-password': 'Please choose a stronger password (at least 8 characters).',
    'auth/user-not-found': 'No account found for that email — create one first!',
    'auth/wrong-password': 'Wrong password — try again, or use "Forgot password?".',
    'auth/invalid-credential': 'Email or password is incorrect — try again, or use "Forgot password?".',
    'auth/too-many-requests': 'Too many attempts — please wait a few minutes and try again.',
    'auth/network-request-failed': 'Network problem — please check your connection and try again.',
  };
  const friendly = err => FRIENDLY[err && err.code] || 'Something went wrong — please try again.';

  // ---- Panel switching ----
  const panels = ['panel-signin', 'panel-signup', 'panel-magic', 'panel-reset'];
  const show = id => {
    panels.forEach(p => { $(p).hidden = p !== id; });
    $('tab-signin').classList.toggle('active', id === 'panel-signin');
    $('tab-signup').classList.toggle('active', id === 'panel-signup');
    $('tab-signin').setAttribute('aria-selected', id === 'panel-signin');
    $('tab-signup').setAttribute('aria-selected', id === 'panel-signup');
    say('');
  };
  $('tab-signin').addEventListener('click', () => show('panel-signin'));
  $('tab-signup').addEventListener('click', () => show('panel-signup'));
  $('show-magic').addEventListener('click', () => show('panel-magic'));
  $('show-reset').addEventListener('click', () => show('panel-reset'));
  document.querySelectorAll('.auth-back').forEach(b => b.addEventListener('click', () => show('panel-signin')));

  const busy = (form, on, label) => {
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = on;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Please wait…'; }
    else if (btn.dataset.label) { btn.textContent = btn.dataset.label; }
  };

  // ---- Signed-in vs signed-out views ----
  fb.onAuthStateChanged(fb.auth, user => {
    $('auth-box').hidden = !!user;
    $('member-view').hidden = !user;
    if (!user) return;
    $('member-name').textContent = user.displayName || 'Member';
    $('member-email').textContent = user.email;
    const since = new Date(user.metadata.creationTime);
    $('member-since').textContent = `Member since ${since.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    $('member-id').textContent = `Membership no. LM-${user.uid.slice(0, 8).toUpperCase()}`;
    $('verify-banner').hidden = user.emailVerified || !user.email;
  });

  // ---- Create account ----
  $('panel-signup').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    busy(f, true, 'Creating your account…');
    try {
      const cred = await fb.createUserWithEmailAndPassword(fb.auth, f.email.value.trim(), f.password.value);
      await fb.updateProfile(cred.user, { displayName: f.name.value.trim() });
      fb.sendEmailVerification(cred.user).catch(() => {});
      $('member-name').textContent = f.name.value.trim();
      say('🎉 Welcome to the family! Your free membership is ready.');
    } catch (err) {
      say(friendly(err), true);
    }
    busy(f, false);
  });

  // ---- Sign in ----
  $('panel-signin').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    busy(f, true, 'Signing you in…');
    try {
      await fb.signInWithEmailAndPassword(fb.auth, f.email.value.trim(), f.password.value);
    } catch (err) {
      say(friendly(err), true);
    }
    busy(f, false);
  });

  // ---- One-time email link (passwordless sign-in) ----
  const linkSettings = { url: location.origin + location.pathname, handleCodeInApp: true };
  $('panel-magic').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    busy(f, true, 'Sending…');
    try {
      const email = f.email.value.trim();
      await fb.sendSignInLinkToEmail(fb.auth, email, linkSettings);
      localStorage.setItem('lm-member-email', email);
      say('📬 Link sent! Check your email on this device and tap the link to sign in.');
      f.reset();
    } catch (err) {
      say(friendly(err), true);
    }
    busy(f, false);
  });

  // Complete the sign-in when the visitor arrives via the emailed link
  if (fb.isSignInWithEmailLink(fb.auth, location.href)) {
    let email = localStorage.getItem('lm-member-email');
    if (!email) email = window.prompt('Please confirm your email to finish signing in:');
    if (email) {
      try {
        await fb.signInWithEmailLink(fb.auth, email.trim(), location.href);
        localStorage.removeItem('lm-member-email');
        history.replaceState(null, '', location.pathname); // tidy the long link from the address bar
      } catch (err) {
        say(friendly(err), true);
      }
    }
  }

  // ---- Forgot password ----
  $('panel-reset').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    busy(f, true, 'Sending…');
    try {
      await fb.sendPasswordResetEmail(fb.auth, f.email.value.trim());
      say('📬 Reset link sent — check your inbox (and the spam folder, just in case).');
      f.reset();
    } catch (err) {
      say(friendly(err), true);
    }
    busy(f, false);
  });

  // ---- Member view actions ----
  $('resend-verify').addEventListener('click', async () => {
    if (fb.auth.currentUser) {
      await fb.sendEmailVerification(fb.auth.currentUser).catch(() => {});
      $('verify-banner').firstChild.textContent = '📧 Verification email sent again — check your inbox. ';
    }
  });
  $('sign-out').addEventListener('click', () => fb.signOut(fb.auth));
})();
