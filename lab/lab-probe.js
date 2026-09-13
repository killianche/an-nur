// Зонд стенда, прогон 4: сплошная запись недоступна, на устройстве лежат
// старые поаятные файлы суры 83. Меряем швы, которые iOS даёт в поаятном
// режиме: тишину между аятами и задержку старта каждого элемента.
(function () {
  const log = (...a) => console.log('LAB|' + a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(200); } return null; }
  if (localStorage.getItem('reciter') !== 'yasser') { localStorage.setItem('reciter', 'yasser'); location.reload(); return; }

  const t0 = performance.now();
  const T = () => Math.round(performance.now() - t0);
  const els = [];
  const tail = s => (s || '').replace(/^.*\/(audio\/|quran\/|data\/)/, '').slice(-40);
  const Orig = window.Audio;
  window.Audio = function (...a) {
    const el = new Orig(...a); const id = els.length; els.push(el);
    for (const e of ['loadstart', 'waiting', 'stalled', 'seeking', 'playing', 'ended', 'error', 'pause']) {
      el.addEventListener(e, () => log('ev', T(), '#' + id, e, +el.currentTime.toFixed(2), el.readyState, tail(el.currentSrc || el.src)));
    }
    return el;
  };
  window.Audio.prototype = Orig.prototype;

  (async () => {
    await waitFor(() => document.querySelector('[data-surah="83"]') || document.querySelector('[data-ayah-anchor]'), 30000);
    await sleep(1500);
    if (!document.querySelector('[data-surah="83"]')) document.querySelector('button[aria-label="Назад"]')?.click();
    const row = await waitFor(() => document.querySelector('[data-surah="83"]'), 20000);
    // Первый запуск: приложение сканирует диск в поисках поаятных файлов.
    await sleep(75000);
    row.scrollIntoView({ block: 'center' });
    await sleep(400);
    const b = row.querySelector('button[aria-label^="Слушать суру"]');
    log('click', b ? b.getAttribute('aria-label') : 'нет кнопки');
    b && b.click();
    let silentSince = null, started = false, label = '';
    const gaps = [];
    const sampler = setInterval(() => {
      const playing = els.filter(e => !e.paused && e.src);
      const mini = document.querySelector('[aria-label="Звучит сейчас"]');
      const l = mini ? mini.textContent.replace(/\s+/g, ' ').slice(0, 30) : '';
      if (l !== label) { log('ui', T(), l, 'playing=' + playing.length); label = l; }
      const audible = playing.some(e => e.readyState >= 3 && e.currentTime > 0);
      if (audible) {
        if (silentSince !== null && started) { const g = Math.round(performance.now() - silentSince); gaps.push(g); log('gap', T(), g); }
        silentSince = null; started = true;
      } else if (silentSince === null) silentSince = performance.now();
    }, 20);
    await sleep(150000);
    clearInterval(sampler);
    const s = [...gaps].sort((x, y) => x - y);
    log('result', { gaps: gaps.length, median: s[Math.floor(s.length / 2)] ?? null, max: s[s.length - 1] ?? null, elements: els.length, srcs: els.slice(0, 6).map(e => tail(e.src)) });
    log('ALL-DONE');
  })();
})();
