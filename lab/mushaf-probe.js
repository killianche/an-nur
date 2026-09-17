// Зонд: открывает мусхаф на странице 77 и после каждой серии рывков проверяет
// раскладку листов: не налезает ли соседний лист на кадр.
(function () {
  const log = (...a) => console.log('LAB|' + a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(200); } return null; }
  if (!localStorage.getItem('lab.init')) { localStorage.setItem('lab.init', '1'); localStorage.setItem('mushaf.page', '77'); }
  (async () => {
    await waitFor(() => document.querySelector('[data-surah="4"]') || document.querySelector('.mushaf-page-track'), 40000);
    await sleep(2500);
    if (!document.querySelector('.mushaf-page-track')) {
      document.querySelector('[data-surah="4"] button')?.click();
      await sleep(3000);
      const h = document.querySelector('.screen-header') ?? document.querySelector('header');
      [...(h?.querySelectorAll('button') ?? [])].find(x => /мусхаф/i.test(x.getAttribute('aria-label') ?? ''))?.click();
    }
    const t = await waitFor(() => document.querySelector('.mushaf-page-track'), 20000);
    await sleep(4000);
    const check = () => {
      const tr = t.getBoundingClientRect();
      const n = Number((document.querySelector('.screen-header')?.textContent?.match(/Страница\s+(\d+)/) ?? [])[1]);
      const layers = [...document.querySelectorAll('.mushaf-page-layer')].map(l => {
        const r = l.getBoundingClientRect();
        return { cur: l.hasAttribute('data-current'), x: Math.round(r.left - tr.left), w: Math.round(r.width) };
      });
      const inView = layers.filter(l => l.x < tr.width - 1 && l.x + l.w > 1);
      return { page: n, scrollLeft: Math.round(t.scrollLeft), turning: t.dataset.turning !== undefined, inView: inView.length, layers };
    };
    let монтаж = 0, снятие = 0;
    new MutationObserver(ms => { for (const m of ms) { m.addedNodes.forEach(n => { if (n.classList?.contains('mushaf-page-layer')) монтаж++; }); m.removedNodes.forEach(n => { if (n.classList?.contains('mushaf-page-layer')) снятие++; }); } })
      .observe(t.firstElementChild, { childList: true });
    setInterval(() => log('churn', { монтаж, снятие }), 5000);
    log('READY', check());
    window.addEventListener('lab-check', () => log('CHECK', check()));
    setInterval(() => { const c = check(); if (c.inView > 1 && !c.turning) log('OVERLAP', c); }, 500);
    let n = 0;
    setInterval(() => { n++; if (n % 4 === 0) log('tick', check()); }, 1000);
  })();
})();
