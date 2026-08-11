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

// ─── Время намаза ─────────────────────────────────────────────────────
//
// Зачем это здесь.  Время намаза — не косметика: ошибка в углах или
// потерянная поправка означают намаз не в своё время, и увидеть это
// на экране невозможно — цифры выглядят правдоподобно любыми.
//
// Эталон — расписание «Назрань 2» на 11 августа 2026, снятое с двух
// независимых приложений (1Muslim и Sajda), которые в этот день дали
// одно и то же по всем шести временам.
const prayerMod = await import(pathToFileURL(resolve(ROOT, 'src/lib/prayerTimes.ts')).href);
const {
  timesFor, nextPrayer, methodById, usesTimetable, DEFAULT_SETTINGS,
  ZERO_ADJUSTMENTS, METHODS, PRAYER_ORDER, IS_PRAYER,
} = prayerMod;

group('Время намаза — расписание «Назрань 2»', () => {
  const NAZRAN = { lat: 43.2256, lon: 44.7642 };
  const DAY = new Date(2026, 7, 11);
  const KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  // Часовой пояс задаём явно: тест не должен зависеть от настроек
  // машины, на которой его запускают.
  const hhmm = d => d.toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
  });
  const table = s => KEYS.map(k => hhmm(timesFor(NAZRAN, DAY, s)[k]));

  check('дефолт — «Назрань 2», шафиитский аср',
    [DEFAULT_SETTINGS.method, DEFAULT_SETTINGS.madhab], ['nazran2', 'shafi']);

  check('11 августа 2026 совпадает с 1Muslim и Sajda',
    table(DEFAULT_SETTINGS),
    ['03:23', '05:02', '12:12', '16:01', '19:11', '20:42']);

  // Без ихтията получилась бы чистая астрономия — на зухре разница
  // в шесть минут, то есть намаз до времени.
  check('без ихтията зухр уезжает на шесть минут раньше',
    table({ method: 'dumrf', madhab: 'shafi', adjustments: ZERO_ADJUSTMENTS })[2],
    '12:06');

  check('ханафитский аср отличается на час',
    table({ ...DEFAULT_SETTINGS, madhab: 'hanafi' })[3], '17:05');

  // Ручная поправка не должна затирать ихтият метода: +6 у зухра и
  // −2 от пользователя дают +4, а не −2.
  check('ручная поправка складывается с ихтиятом метода',
    table({ ...DEFAULT_SETTINGS, adjustments: { ...ZERO_ADJUSTMENTS, dhuhr: -2 } })[2],
    '12:10');

  check('поправка у одного намаза не трогает соседние',
    table({ ...DEFAULT_SETTINGS, adjustments: { ...ZERO_ADJUSTMENTS, dhuhr: -2 } })[3],
    '16:01');

  check('у «Назрани 2» ихтият задан, у общих методов его нет',
    [!!methodById('nazran2').offsets, !!methodById('mwl').offsets], [true, false]);

  check('все методы имеют указание источника',
    METHODS.every(m => typeof m.source === 'string' && m.source.length > 10), true);

  check('идентификаторы методов уникальны',
    new Set(METHODS.map(m => m.id)).size, METHODS.length);
});

group('Время намаза — ближайший намаз', () => {
  const NAZRAN = { lat: 43.2256, lon: 44.7642 };
  const at = (h, m) => new Date(2026, 7, 11, h, m);

  check('в 08:00 следующий — зухр',
    nextPrayer(NAZRAN, at(8, 0), DEFAULT_SETTINGS).key, 'dhuhr');

  // Восход не намаз, а граница времени фаджра: отсчёт «до восхода»
  // вводил бы в заблуждение.
  check('в 04:00 следующий не восход, а зухр',
    nextPrayer(NAZRAN, at(4, 0), DEFAULT_SETTINGS).key, 'dhuhr');

  check('восход помечен как не-намаз',
    [IS_PRAYER.sunrise, PRAYER_ORDER.includes('sunrise')], [false, true]);

  const after = nextPrayer(NAZRAN, at(23, 30), DEFAULT_SETTINGS);
  check('после иши экран не пустеет — берётся завтрашний фаджр',
    [after.key, after.tomorrow], ['fajr', true]);
  check('завтрашний фаджр действительно завтра',
    after.at.getTime() > at(23, 30).getTime(), true);
});

// ─── Печатный календарь Ингушетии ─────────────────────────────────────
//
// Эталон набран с фотографии печатного календаря Назрани (alansar.ru)
// за август 2026, которую прислал владелец.  Это первоисточник, а не
// пересказ: если таблица в приложении когда-нибудь разойдётся с ним,
// тест обязан упасть.
const timetableMod = await import(pathToFileURL(resolve(ROOT, 'src/lib/nazranTimetable.ts')).href);
const { timetableSize, timetableDay } = timetableMod;

group('Печатный календарь Ингушетии — август 2026', () => {
  // Дни 1–31: фаджр восход зухр аср магриб иша
  const PHOTO = `
    03:06 04:51 12:13 16:07 19:25 21:00
    03:08 04:52 12:13 16:06 19:23 20:58
    03:10 04:53 12:13 16:06 19:22 20:57
    03:11 04:54 12:13 16:05 19:21 20:55
    03:13 04:55 12:13 16:05 19:20 20:53
    03:15 04:56 12:13 16:04 19:18 20:51
    03:16 04:57 12:12 16:04 19:17 20:50
    03:18 04:58 12:12 16:03 19:16 20:48
    03:19 04:59 12:12 16:03 19:14 20:46
    03:21 05:01 12:12 16:02 19:13 20:44
    03:23 05:02 12:12 16:01 19:11 20:42
    03:24 05:03 12:12 16:01 19:10 20:40
    03:26 05:04 12:12 16:00 19:09 20:38
    03:27 05:05 12:11 15:59 19:07 20:36
    03:29 05:06 12:11 15:59 19:06 20:35
    03:30 05:07 12:11 15:58 19:04 20:33
    03:32 05:08 12:11 15:57 19:02 20:31
    03:34 05:09 12:11 15:56 19:01 20:29
    03:35 05:11 12:10 15:56 18:59 20:27
    03:37 05:12 12:10 15:55 18:58 20:25
    03:38 05:13 12:10 15:54 18:56 20:23
    03:40 05:14 12:10 15:53 18:55 20:21
    03:41 05:15 12:09 15:52 18:53 20:19
    03:43 05:16 12:09 15:51 18:51 20:17
    03:44 05:17 12:09 15:50 18:50 20:15
    03:46 05:18 12:09 15:50 18:48 20:13
    03:47 05:20 12:08 15:49 18:46 20:11
    03:49 05:21 12:08 15:48 18:45 20:09
    03:50 05:22 12:08 15:47 18:43 20:07
    03:51 05:23 12:07 15:46 18:41 20:05
    03:53 05:24 12:07 15:45 18:39 20:03
  `.trim().split('\n').map(l => l.trim().split(/\s+/));

  const NAZRAN = { lat: 43.2256, lon: 44.7642 };
  const KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const hhmm = d => d.toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
  });

  check('в таблице ровно год', timetableSize(), 365);
  check('29 февраля подставляется 28-м',
    timetableDay(2, 29), timetableDay(2, 28));

  let mismatch = [];
  for (let day = 1; day <= 31; day++) {
    const t = timesFor(NAZRAN, new Date(2026, 7, day), DEFAULT_SETTINGS);
    KEYS.forEach((k, i) => {
      const got = hhmm(t[k]);
      if (got !== PHOTO[day - 1][i]) {
        mismatch.push(`${day} авг ${k}: ${got} вместо ${PHOTO[day - 1][i]}`);
      }
    });
  }
  check('все 186 значений августа совпадают с фотографией', mismatch, []);

  // Календарь назрановский. Показывать его времена в Москве было бы
  // прямой ошибкой — там должен включаться расчёт.
  const MOSCOW = { lat: 55.7558, lon: 37.6173 };
  check('вне Ингушетии календарь не применяется',
    usesTimetable(MOSCOW, DEFAULT_SETTINGS), false);
  check('в Ингушетии применяется',
    usesTimetable(NAZRAN, DEFAULT_SETTINGS), true);
  check('соседняя Сунжа тоже покрыта',
    usesTimetable({ lat: 43.3197, lon: 45.0447 }, DEFAULT_SETTINGS), true);
  check('у Грозного своё расписание, календарь Назрани не подставляем',
    usesTimetable({ lat: 43.3169, lon: 45.6981 }, DEFAULT_SETTINGS), false);
  check('другой метод календарь не включает',
    usesTimetable(NAZRAN, { ...DEFAULT_SETTINGS, method: 'mwl' }), false);

  // Ханафитского асра в печатном календаре нет — он считается, а
  // остальные пять времён всё равно должны прийти из таблицы.
  const hanafi = timesFor(NAZRAN, new Date(2026, 7, 11), { ...DEFAULT_SETTINGS, madhab: 'hanafi' });
  check('при ханафитском мазхабе фаджр остаётся календарным',
    hhmm(hanafi.fajr), '03:23');
  check('а аср считается', hhmm(hanafi.asr), '17:05');

  // Ручная поправка обязана работать и поверх таблицы.
  const shifted = timesFor(NAZRAN, new Date(2026, 7, 11), {
    ...DEFAULT_SETTINGS, adjustments: { ...ZERO_ADJUSTMENTS, fajr: -3 },
  });
  check('ручная поправка применяется к календарю', hhmm(shifted.fajr), '03:20');
  check('и не задевает соседние времена', hhmm(shifted.isha), '20:42');
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
