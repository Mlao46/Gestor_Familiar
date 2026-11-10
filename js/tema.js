// Modo claro / oscuro. Se carga antes que la página para que no haya parpadeo.
// Valores guardados en este dispositivo: 'oscuro' (por defecto), 'claro' o 'auto' (según el sistema).
(function () {
  var medio = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function leer() { try { return localStorage.getItem('tema') || 'oscuro'; } catch (e) { return 'oscuro'; } }
  function aplicar(tema) {
    var oscuro = tema === 'oscuro' || (tema === 'auto' && medio && medio.matches);
    document.documentElement.classList.toggle('oscuro', oscuro);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', oscuro ? '#111210' : '#F5F4EF');
  }
  window.temaActual = leer;
  window.cambiarTema = function (tema) {
    try { localStorage.setItem('tema', tema); } catch (e) {}
    aplicar(tema);
  };
  if (medio && medio.addEventListener) medio.addEventListener('change', function () { if (leer() === 'auto') aplicar('auto'); });
  aplicar(leer());
})();
