// Зонд: открывает мусхаф и пишет номер страницы и положение ленты.
(function () {
  const log = (...a) => console.log('LAB|' + a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(200); } return null; }
  (async () => {
    await waitFor(() => document.querySelector('[data-surah="2"]') || document.querySelector('.mushaf-page-track'), 40000);
    await sleep(2500);
    if (!document.querySelector('.mushaf-page-track')) {
      document.querySelector('[data-surah="2"] button')?.click();
      await sleep(3000);
      const h = document.querySelector('.screen-header') ?? document.querySelector('header');
      [...(h?.querySelectorAll('button') ?? [])].find(x => /мусхаф/i.test(x.getAttribute('aria-label') ?? ''))?.click();
    }
    const t = await waitFor(() => document.querySelector('.mushaf-page-track'), 20000);
    await sleep(4000);
    const snap = () => {
      const step = t.clientWidth + 18;
      const n = Number((document.querySelector('.screen-header')?.textContent?.match(/Страница\s+(\d+)/) ?? [])[1]);
      return { page: n, scrollLeft: Math.round(t.scrollLeft), aligned: Math.abs(t.scrollLeft - (604 - n) * step) < 1, turning: t.dataset.turning !== undefined, layers: document.querySelectorAll('.mushaf-page-layer').length, blankCurrent: !document.querySelector('.mushaf-page-layer[data-current] .mushaf-page, .mushaf-page-layer[data-current] [data-verse-key]') };
    };
    log('READY', snap());
    let prev = '';
    t.addEventListener('scroll', () => { const s = JSON.stringify(snap()); if (s !== prev) { prev = s; } });
    setInterval(() => { const s = JSON.stringify(snap()); if (s !== prev) { prev = s; log('state', Math.round(performance.now()), s); } }, 250);
    window.__labSnap = snap;
  })();
})();
