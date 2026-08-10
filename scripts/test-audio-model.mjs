#!/usr/bin/env node
/**
 * test-audio-model.mjs — проверка арифметики офлайн-модели аудио.
 *
 * Почему это отдельный скрипт, а не vitest: единственное, что здесь
 * нужно проверять, — чистые функции без DOM и без React.  Ради них
 * тянуть тестовый раннер с полусотней зависимостей смысла нет, а
 * `node --experimental-strip-types` умеет импортировать .ts напрямую.
 *
 * Почему это вообще нужно. На нумерации аятов держится вся офлайн-
 * модель: сдвинется на единицу — приложение начнёт молча играть
 * не тот аят и складывать файлы не под теми именами. Такую ошибку
 * не видно ни в типах, ни в сборке, ни глазами на экране.
 *
 * Запуск:  npm test
 */

import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const mod = await import(pathToFileURL(resolve(ROOT, 'src/lib/ayahNumbering.ts')).href);
const searchMod = await import(pathToFileURL(resolve(ROOT, 'src/lib/search.ts')).href);
const { JUZ_SECTIONS } = await import(pathToFileURL(resolve(ROOT, 'src/lib/juz.ts')).href);
const {
  globalAyahNumber, ayahsInSurah, firstGlobalOfSurah, juzRange,
  TOTAL_AYAHS, TOTAL_SURAHS,
} = mod;

let passed = 0;
const failures = [];

function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { passed++; return; }
  failures.push(`${name}\n      получено:  ${JSON.stringify(got)}\n      ожидалось: ${JSON.stringify(want)}`);
}

function group(title, fn) {
  console.log(`\n  ${title}`);
  const before = failures.length;
  fn();
  const bad = failures.length - before;
  console.log(bad === 0 ? '    ✓' : `    ✗ ${bad}`);
}

// ─── Сквозная нумерация ───────────────────────────────────────────────
group('Сквозная нумерация аятов', () => {
  check('1:1 — первый аят Корана', globalAyahNumber(1, 1), 1);
  check('1:7 — конец Аль-Фатихи', globalAyahNumber(1, 7), 7);
  check('2:1 — начало Аль-Бакары', globalAyahNumber(2, 1), 8);
  check('2:255 — аят аль-Курси', globalAyahNumber(2, 255), 262);
  check('2:286 — конец Аль-Бакары', globalAyahNumber(2, 286), 293);
  check('114:6 — последний аят Корана', globalAyahNumber(114, 6), TOTAL_AYAHS);

  let sum = 0;
  for (let s = 1; s <= TOTAL_SURAHS; s++) sum += ayahsInSurah(s);
  check('сумма длин 114 сур = 6236', sum, TOTAL_AYAHS);

  check('ayahsInSurah вне диапазона', [ayahsInSurah(0), ayahsInSurah(115)], [0, 0]);
});

// ─── Границы сур ──────────────────────────────────────────────────────
group('Суры стыкуются без дыр и нахлёстов', () => {
  let gaps = 0;
  for (let s = 1; s <= TOTAL_SURAHS; s++) {
    const last = firstGlobalOfSurah(s) + ayahsInSurah(s) - 1;
    const expectedNext = s === TOTAL_SURAHS ? TOTAL_AYAHS : firstGlobalOfSurah(s + 1) - 1;
    if (last !== expectedNext) gaps++;
  }
  check('разрывов между сурами', gaps, 0);
  check('первая сура начинается с 1', firstGlobalOfSurah(1), 1);

  // Обратная проверка: каждый сквозной номер принадлежит ровно одной суре.
  const seen = new Uint8Array(TOTAL_AYAHS + 1);
  for (let s = 1; s <= TOTAL_SURAHS; s++) {
    for (let a = 1; a <= ayahsInSurah(s); a++) seen[globalAyahNumber(s, a)]++;
  }
  let notOnce = 0;
  for (let n = 1; n <= TOTAL_AYAHS; n++) if (seen[n] !== 1) notOnce++;
  check('каждый номер 1..6236 покрыт ровно один раз', notOnce, 0);
});

// ─── Джузы ────────────────────────────────────────────────────────────
group('Джузы покрывают Коран без дыр', () => {
  check('джуз 1 начинается с первого аята', juzRange(1)[0], 1);
  check('джуз 1 кончается перед 2:142', juzRange(1)[1], globalAyahNumber(2, 142) - 1);
  check('джуз 30 начинается с 78:1', juzRange(30)[0], globalAyahNumber(78, 1));
  check('джуз 30 кончается последним аятом', juzRange(30)[1], TOTAL_AYAHS);

  let prev = 0, broken = 0;
  for (let j = 1; j <= 30; j++) {
    const [from, to] = juzRange(j);
    if (from !== prev + 1 || to < from) broken++;
    prev = to;
  }
  check('30 джузов идут встык', broken, 0);
  check('последний джуз доходит до конца', prev, TOTAL_AYAHS);

  check('juz(0) и juz(99) зажимаются в диапазон',
    [juzRange(0)[0], juzRange(99)[1]], [1, TOTAL_AYAHS]);
});

// ─── Битовая карта ────────────────────────────────────────────────────
group('Битовая карта скачанного', () => {
  const BYTES = Math.ceil(TOTAL_AYAHS / 8);
  check('размер карты в байтах', BYTES, 780);

  const map = new Uint8Array(BYTES);
  const set = n => { const i = n - 1; map[i >> 3] |= (1 << (i & 7)); };
  const has = n => { const i = n - 1; return (map[i >> 3] & (1 << (i & 7))) !== 0; };
  const popcount = () => {
    let n = 0;
    for (let b = 0; b < map.length; b++) { let v = map[b]; while (v) { v &= v - 1; n++; } }
    return n;
  };

  check('пустая карта', popcount(), 0);

  // Главный сценарий, который ломала прошлая модель «скачано до N»:
  // произвольная дырявая выборка посреди длинной суры.
  set(globalAyahNumber(2, 150));
  set(globalAyahNumber(2, 152));
  check('2:150 есть', has(globalAyahNumber(2, 150)), true);
  check('2:151 НЕТ — дырка допустима', has(globalAyahNumber(2, 151)), false);
  check('2:152 есть', has(globalAyahNumber(2, 152)), true);
  check('счётчик после двух отметок', popcount(), 2);

  set(1);
  set(TOTAL_AYAHS);
  check('границы диапазона', [has(1), has(TOTAL_AYAHS)], [true, true]);
  check('за границей ничего не задето', has(TOTAL_AYAHS + 1) === true, false);

  // Полная карта
  const full = new Uint8Array(BYTES).fill(0xff);
  let cnt = 0;
  for (let n = 1; n <= TOTAL_AYAHS; n++) {
    const i = n - 1;
    if ((full[i >> 3] & (1 << (i & 7))) !== 0) cnt++;
  }
  check('полная карта покрывает все 6236', cnt, TOTAL_AYAHS);

  // base64 round-trip — так карта хранится в Preferences
  const b64 = Buffer.from(map).toString('base64');
  const back = new Uint8Array(Buffer.from(b64, 'base64'));
  check('base64 туда-обратно', Array.from(back).join(), Array.from(map).join());
  check('карта в base64 занимает ~1 КБ', b64.length, 1040);
});

// ─── Полнота суры ─────────────────────────────────────────────────────
group('Определение «сура скачана целиком»', () => {
  const BYTES = Math.ceil(TOTAL_AYAHS / 8);
  const map = new Uint8Array(BYTES);
  const set = n => { const i = n - 1; map[i >> 3] |= (1 << (i & 7)); };
  const has = n => { const i = n - 1; return (map[i >> 3] & (1 << (i & 7))) !== 0; };
  const inSurah = s => {
    let n = 0;
    const first = firstGlobalOfSurah(s);
    for (let k = 0; k < ayahsInSurah(s); k++) if (has(first + k)) n++;
    return n;
  };

  for (let a = 1; a <= 7; a++) set(globalAyahNumber(1, a));
  check('Аль-Фатиха: 7 из 7', inSurah(1), 7);
  check('Аль-Фатиха целиком', inSurah(1) === ayahsInSurah(1), true);
  check('соседняя сура не задета', inSurah(2), 0);

  // Крайний случай: последняя сура у самой границы карты
  for (let a = 1; a <= ayahsInSurah(114); a++) set(globalAyahNumber(114, a));
  check('Ан-Нас целиком у границы', inSurah(114) === ayahsInSurah(114), true);
  check('предыдущая сура не задета', inSurah(113), 0);
});

// ─── Разрез по джузам ─────────────────────────────────────────────────
// Отдельно от juzRange: там сквозные номера, здесь — пары «сура, аят»,
// которые видит человек на экране. Сдвиг на единицу выглядит
// правдоподобно и глазами не ловится.
group('Разрез по джузам для экрана', () => {
  check('джузов ровно 30', JUZ_SECTIONS.length, 30);

  const first = JUZ_SECTIONS[0].rows[0];
  check('джуз 1 начинается с 1:1',
    [first.meta.number, first.from], [1, 1]);

  const j30 = JUZ_SECTIONS[29].rows;
  const lastRow = j30[j30.length - 1];
  check('джуз 30 кончается на 114:6',
    [lastRow.meta.number, lastRow.to], [114, 6]);

  const j2 = JUZ_SECTIONS[1].rows;
  check('джуз 2 — это середина Аль-Бакары, 2:142',
    [j2.length, j2[0].meta.number, j2[0].from], [1, 2, 142]);
  check('и он не сура целиком', j2[0].whole, false);

  // Главная проверка: отрезки идут встык и покрывают все 6236 аятов
  // ровно по разу.
  const seen = new Uint8Array(TOTAL_AYAHS + 1);
  let prev = 0, broken = 0;
  for (const { rows } of JUZ_SECTIONS) {
    for (const r of rows) {
      if (r.to < r.from) broken++;
      const from = globalAyahNumber(r.meta.number, r.from);
      if (from !== prev + 1) broken++;
      for (let n = from; n <= from + (r.to - r.from); n++) seen[n]++;
      prev = from + (r.to - r.from);
    }
  }
  check('отрезки идут встык', broken, 0);
  check('последний отрезок доходит до конца Корана', prev, TOTAL_AYAHS);

  let notOnce = 0;
  for (let n = 1; n <= TOTAL_AYAHS; n++) if (seen[n] !== 1) notOnce++;
  check('каждый аят попал ровно в один джуз', notOnce, 0);

  // Флаг whole не должен врать: он решает, показывать «286 аятов»
  // или «Аяты 142–286».
  let wrongWhole = 0;
  for (const { rows } of JUZ_SECTIONS) {
    for (const r of rows) {
      const isWhole = r.from === 1 && r.to === ayahsInSurah(r.meta.number);
      if (isWhole !== r.whole) wrongWhole++;
    }
  }
  check('флаг «сура целиком» согласован с границами', wrongWhole, 0);
});

// ─── Поиск по переводу ────────────────────────────────────────────────
group('Поиск по русскому переводу', () => {
  const { search, snippet, normalise } = searchMod;

  check('нормализация: регистр и ё',
    normalise('ЕЁ Господу, миров!'), 'ее господу миров');
  check('нормализация: пустой запрос', normalise('  ,,, '), '');

  const g = search('Господу миров');
  check('«Господу миров» находит аяты', g.ayahs.length > 0, true);
  check('первый результат — 1:2 (Аль-Фатиха)',
    [g.ayahs[0].surah, g.ayahs[0].ayah], [1, 2]);

  // Подсветка обязана быть куском ОРИГИНАЛА, а не нормализованной
  // строки — иначе пользователь увидит покалеченную цитату.
  const h = g.ayahs[0];
  const s = snippet(h);
  check('подсветка вырезана из оригинала',
    h.text.slice(h.matchStart, h.matchEnd), s.match);
  check('подсветка совпадает с запросом без учёта регистра',
    normalise(s.match), normalise('Господу миров'));

  // ё и е — одна буква
  check('«ее» и «её» дают одинаковое число совпадений',
    search('еесли').ayahs.length, search('еёсли').ayahs.length);
  const yo = search('Аллаху');
  check('поиск с заглавной буквы работает', yo.ayahs.length > 0, true);
  check('он же строчными даёт столько же',
    search('аллаху').ayahs.length, yo.ayahs.length);

  // Слишком короткий запрос по переводу не идёт
  const short = search('ее');
  check('запрос короче трёх букв не ищет по переводу',
    [short.ayahs.length, short.tooShortForText], [0, true]);

  // Поиск сур
  check('сура по номеру', search('2').surahs.map(x => x.number), [2]);
  check('сура по названию', search('Фатиха').surahs.map(x => x.number), [1]);
  check('сура по переводу названия', search('Корова').surahs.map(x => x.number), [2]);
  check('пустой запрос — пустой результат',
    [search('').surahs.length, search('').ayahs.length], [0, 0]);
  check('бессмысленный запрос ничего не находит',
    [search('ыфваыфва').surahs.length, search('ыфваыфва').ayahs.length], [0, 0]);

  // Ограничение выдачи
  const many = search('и');
  check('однобуквенный запрос не выдаёт полкорана', many.ayahs.length, 0);
  const common = search('Аллах');
  check('частое слово обрезается до лимита', common.ayahs.length <= 60, true);
  check('и помечается как обрезанное', common.truncated, true);
});

// ─── Итог ─────────────────────────────────────────────────────────────
console.log('');
if (failures.length === 0) {
  console.log(`✅ Все проверки пройдены (${passed})`);
  process.exit(0);
}
console.error(`❌ Провалено: ${failures.length}, пройдено: ${passed}\n`);
for (const f of failures) console.error('  ✗ ' + f);
process.exit(1);
