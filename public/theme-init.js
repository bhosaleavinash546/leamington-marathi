// Applied BEFORE React hydrates so light-theme users don't get a dark flash.
// External file (not inline) because the production CSP forbids inline scripts.
try {
  var t = localStorage.getItem('brainspark_theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
