/* =====================================================
   Firebase configuration for member sign-in.

   HOW TO SWITCH MEMBERSHIP ON (one-time, ~15 minutes):
   1. Go to https://console.firebase.google.com and sign in
      with the leamingtonmarathi@gmail.com Google account.
   2. "Add project" → name it leamington-marathi → Google
      Analytics OFF → Create.
   3. In the project: Build → Authentication → Get started →
      Sign-in method → enable "Email/Password" AND, under it,
      also tick "Email link (passwordless sign-in)". Save.
   4. Authentication → Settings → Authorized domains →
      make sure these are listed (add if missing):
        leamingtonmarathi.com
        bhosaleavinash546.github.io
   5. Project overview → the "</>" (Web) icon → register app
      (name: website, no hosting) → copy the firebaseConfig
      values it shows into the object below.
   6. Commit this file. Done — the member page goes live.

   NOTE: these values are PUBLIC identifiers, not secrets —
   that is how Firebase web apps work. Access is protected by
   the authorized-domain list and Firebase's own rules.
   ===================================================== */
window.LM_FIREBASE_CONFIG = {
  apiKey: "PASTE_API_KEY_HERE",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  appId: "PASTE_APP_ID",
};
