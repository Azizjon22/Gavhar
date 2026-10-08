// Sahifa chizilishidan oldin temani qo'yadi — oq/qora "chaqnash" bo'lmasligi uchun.
// Alohida faylda: qat'iy CSP (inline skriptsiz) bilan ham ishlaydi.
(function () {
  var theme;
  try {
    var stored = JSON.parse(localStorage.getItem('gavhar-theme') || 'null');
    theme = stored && stored.state && stored.state.theme;
  } catch (_error) {
    theme = undefined;
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
})();
