// Зонд стенда, прогон 3: сура скачивается САМИМ приложением (автозагрузка
// чтеца по умолчанию), затем играет из этого файла. Зонд подключается до
// бандла и пишет каждое событие аудиоэлементов.
(function () {
  const log = (...a) => console.log('LAB|' + a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
  const mode = localStorage.getItem('lab.mode') || 'dl';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(200); } return null; }

  if (mode === 'dl') {
    localStorage.setItem('lab.mode', 'play');
    log('mode dl: жду автозагрузку');
    return;
  }

  const t0 = performance.now();
  const T = () => Math.round(performance.now() - t0);
  const els = [];
  const tail = s => (s || '').replace(/^.*\/(audio\/|quran\/)/, '').slice(-40);
  const Orig = window.Audio;
  window.Audio = function (...a) {
    const el = new Orig(...a); const id = els.length; els.push(el);
    for (const e of ['loadstart', 'waiting', 'stalled', 'seeking', 'seeked', 'playing', 'ended', 'error', 'emptied', 'abort']) {
      el.addEventListener(e, () => log('ev', T(), '#' + id, e, +el.currentTime.toFixed(2), el.readyState, tail(el.currentSrc || el.src)));
    }
    return el;
  };
  window.Audio.prototype = Orig.prototype;

  (async () => {
    log('mode play: сура 83 из файла, скачанного приложением');
    await waitFor(() => document.querySelector('[data-surah="83"]') || document.querySelector('[data-ayah-anchor]'), 30000);
    await sleep(1500);
    if (!document.querySelector('[data-surah="83"]')) document.querySelector('button[aria-label="Назад"]')?.click();
    const row = await waitFor(() => document.querySelector('[data-surah="83"]'), 20000);
    await sleep(2500);
    row.scrollIntoView({ block: 'center' });
    await sleep(400);
    const b = row.querySelector('button[aria-label^="Слушать суру"]');
    log('click', b ? b.getAttribute('aria-label') : 'нет кнопки');
    b && b.click();
    let prev = null, lost = 0, hiccups = 0, label = '';
    const sampler = setInterval(() => {
      const playing = els.filter(e => !e.paused && e.src);
      const mini = document.querySelector('[aria-label="Звучит сейчас"]');
      const l = mini ? mini.textContent.replace(/\s+/g, ' ').slice(0, 30) : '';
      if (l !== label) { log('ui', T(), l, 'playing=' + playing.length); label = l; }
      const cur = playing[0], now = performance.now();
      if (cur && prev && prev.el === cur) {
        const dm = cur.currentTime - prev.ct, dw = (now - prev.t) / 1000;
        if (dw > 0.05 && dm < dw * 0.5) { lost += dw - Math.max(0, dm); hiccups++; if (hiccups < 80) log('hiccup', T(), { dm: +dm.toFixed(3), dw: +dw.toFixed(3), ct: +cur.currentTime.toFixed(2), rs: cur.readyState }); }
        if (dm > dw + 0.5 || dm < -0.2) log('jump', T(), { dm: +dm.toFixed(3), ct: +cur.currentTime.toFixed(2) });
      }
      prev = cur ? { el: cur, ct: cur.currentTime, t: now } : { el: null, t: now };
    }, 100);
    await sleep(215000);
    clearInterval(sampler);
    log('result', { lostSec: +lost.toFixed(2), hiccups, elements: els.length, srcs: els.map(e => tail(e.src)) });
    log('ALL-DONE');
  })();
})();
