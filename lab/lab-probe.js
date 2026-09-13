// Зонд стенда: подключается ДО бандла приложения, записывает всё, что делают
// аудиоэлементы, и сам проигрывает сценарии (сура 83 скачана / из сети).
(function () {
  const log = (...a) => console.log('LAB|' + a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
  const SCEN = [
    { name: 'yasser-local-home', reciter: 'yasser', via: 'home', seconds: 250 },
    { name: 'yasser-local-screen', reciter: 'yasser', via: 'screen', seconds: 215 },
    { name: 'alafasy-local-screen', reciter: 'alafasy', via: 'screen', seconds: 150 },
    { name: 'luhaidan-local-screen', reciter: 'luhaidan', via: 'screen', seconds: 150 },
    { name: 'yasser-network-home', reciter: 'yasser', via: 'home', seconds: 120, phase: 'B' },
    { name: 'yasser-network-screen', reciter: 'yasser', via: 'screen', seconds: 215, phase: 'B' },
  ];
  let i = Number(localStorage.getItem('lab.i') ?? '0');
  const sc = SCEN[i];
  if (!sc) { log('ALL-DONE'); return; }
  const phaseA = !sc.phase;
  if (localStorage.getItem('reciter') !== sc.reciter) {
    localStorage.setItem('reciter', sc.reciter);
    location.reload();
    return;
  }

  const t0 = performance.now();
  const T = () => Math.round(performance.now() - t0);
  const els = [];
  const tail = s => (s || '').replace(/^.*\/(audio\/|quran\/|murattal\/|lhdan\/)/, '').slice(-40);
  const Orig = window.Audio;
  function watch(el) {
    const id = els.length; els.push(el);
    const ev = ['loadstart', 'waiting', 'stalled', 'seeking', 'seeked', 'pause', 'play', 'playing', 'ended', 'error', 'emptied', 'abort'];
    for (const e of ev) el.addEventListener(e, () => {
      log('ev', T(), '#' + id, e, (+el.currentTime.toFixed(2)), el.readyState, tail(el.currentSrc || el.src), e === 'error' ? (el.error && el.error.code) : '');
    });
    return el;
  }
  window.Audio = function (...a) { return watch(new Orig(...a)); };
  window.Audio.prototype = Orig.prototype;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(200); } return null; }

  (async () => {
    log('scenario', sc.name, 'start');
    await waitFor(() => document.querySelector('[data-surah="83"]') || document.querySelector('[data-ayah-anchor]'), 30000);
    await sleep(1500);
    if (!document.querySelector('[data-surah="83"]')) {
      const back = document.querySelector('button[aria-label="Назад"]');
      log('restored-screen, back=', !!back);
      back && back.click();
    }
    const row = await waitFor(() => document.querySelector('[data-surah="83"]'), 20000);
    if (!row) { log('scenario', sc.name, 'no-home-row'); localStorage.setItem('lab.i', String(i + 1)); location.reload(); return; }
    await sleep(2500);
    if (sc.via === 'home') {
      row.scrollIntoView({ block: 'center' });
      await sleep(400);
      const b = row.querySelector('button[aria-label^="Слушать суру"]');
      log('click', b ? b.getAttribute('aria-label') : 'нет кнопки');
      b && b.click();
    } else {
      row.scrollIntoView({ block: 'center' });
      await sleep(400);
      row.querySelector('button').click();
      const btn = await waitFor(() => document.querySelector('[data-ayah-anchor="1"] button[aria-label="Слушать аят"]'), 20000);
      await sleep(2500);
      log('click', btn ? 'Слушать аят 1' : 'нет кнопки');
      btn && btn.click();
    }

    // Сэмплер: время записи против настенного, раз в 100 мс.
    let prev = null, lost = 0, hiccups = 0, label = '';
    const sampler = setInterval(() => {
      const playing = els.filter(e => !e.paused && e.src);
      const active = document.querySelector('[data-ayah-anchor][data-active="true"]');
      const mini = document.querySelector('[aria-label="Звучит сейчас"]');
      const l = active ? 'ayah ' + active.getAttribute('data-ayah-anchor') : (mini ? mini.textContent.replace(/\s+/g, ' ').slice(0, 30) : '');
      if (l !== label) { log('ui', T(), l, 'playing=' + playing.length); label = l; }
      const cur = playing[0];
      const now = performance.now();
      if (cur && prev && prev.el === cur) {
        const dm = cur.currentTime - prev.ct, dw = (now - prev.t) / 1000;
        if (dw > 0.05 && dm < dw * 0.5) { lost += dw - Math.max(0, dm); hiccups++; if (hiccups < 60) log('hiccup', T(), { dm: +dm.toFixed(3), dw: +dw.toFixed(3), ct: +cur.currentTime.toFixed(2), rs: cur.readyState }); }
        if (dm > dw + 0.5 || dm < -0.2) log('jump', T(), { dm: +dm.toFixed(3), dw: +dw.toFixed(3), ct: +cur.currentTime.toFixed(2) });
      }
      if (!cur && prev && prev.el) log('silence-start', T());
      prev = cur ? { el: cur, ct: cur.currentTime, t: now } : { el: null, t: now };
    }, 100);

    await sleep(sc.seconds * 1000);
    clearInterval(sampler);
    log('scenario', sc.name, 'result', { lostSec: +lost.toFixed(2), hiccups, elements: els.length });
    for (const e of els) { try { e.pause(); } catch (x) {} }
    localStorage.setItem('lab.i', String(i + 1));
    const next = SCEN[i + 1];
    if (next && next.phase && phaseA) { log('PHASE-A-DONE'); return; }
    if (!next) { log('ALL-DONE'); return; }
    location.reload();
  })();
})();
