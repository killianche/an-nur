/**
 * Генератор постраничной разметки мусхафа QCF V1 «Мадани» (издание 1405).
 *
 * ── Зачем ─────────────────────────────────────────────────────────────
 *
 * 605 шрифтов V1 (48 МБ) уже лежат в `public/qcf1/fonts-woff2` и едут в
 * каждом пакете iOS и Android, но в полноэкранном режиме недоступны: там
 * есть только QCF V4 и цветной таджвид. Не хватало ровно одного — разметки
 * «какое слово на какой строке». Шрифты новых байтов не потребуют.
 *
 * ── Откуда данные ─────────────────────────────────────────────────────
 *
 * `api.qurancdn.com/api/qdc/verses/by_page/{N}` — тот же источник, что уже
 * используется генератором цветного таджвида (`fetch-tajweed-data.ts`).
 *
 * ── 🔴 Ловушка, стоившая бы молчаливой ошибки ─────────────────────────
 *
 * Параметр `mushaf` НЕ интуитивен: **`mushaf=1` — это QCF V2, а
 * `mushaf=2` — QCF V1.** Проверено дважды и независимо:
 *
 *   1. Перечисление в исходниках quran.com
 *      (`quran/quran.com-frontend-next`, `types/QuranReader.ts`):
 *      `QCFV2 = 1, QCFV1 = 2`, и рядом `MadaniV1 → QCFV1`.
 *   2. Экспериментом: на странице 3 разбиение по строкам у `mushaf=1` и
 *      `mushaf=2` расходится (строки 8–10: 11/9/9 против 9/10/10).
 *
 * При этом САМИ КОДЫ глифов (`code_v1`) одинаковы при обоих значениях —
 * сверено с проверенными `v1Codes` из `public/arabic-editions.json`,
 * совпало 11 из 11 аятов страницы 3. То есть ошибка в `mushaf` не дала бы
 * ни пустых глифов, ни сбоя загрузки: страница отрисовалась бы красиво и
 * молча с ЧУЖИМ разбиением по строкам. Ровно тот класс ошибок, о котором
 * предупреждает `MUSHAF_FONTS.md`.
 *
 * ── Нумерация строк на первых страницах ───────────────────────────────
 *
 * У страниц 1 и 2 API нумерует строки не с единицы: там сверху пустое поле
 * под рамку. Причём смещение РАЗНОЕ — у первой страницы строки 9..15, у
 * второй 10..15. Фиксированное вычитание (как в генераторе таджвида, где
 * отнимают семь) здесь дало бы 7 и 6 строк, начинающихся не с единицы.
 *
 * Поэтому нормализуем по минимальному номеру на самой странице: это
 * выводится из данных, а не подбирается. На обычных страницах строки и так
 * начинаются с единицы, и нормализация ничего не меняет.
 *
 * ── 🛑 СКРИПТ РАБОЧИЙ, НО ФИЧА НЕ ГОТОВА. ЧЕГО НЕ ХВАТАЕТ ─────────────
 *
 * Данные собираются верно для обычных страниц, но **страницы с началом
 * суры собрать нельзя**. На них API для V1 не отдаёт двух строк: заголовка
 * суры и басмалы. Проверено на странице 106 (там кончается сура 4 и
 * начинается сура 5): приходят строки 1–5 и 8–15, шестая и седьмая пусты.
 * У V4 на той же странице строка 6 — `type: surah_header`.
 *
 * Причина: в QCF V1 заголовок и басмала рисуются отдельным шрифтом
 * `public/qcf1/fonts-woff2/QCF_BSML.woff2`. В нём 683 глифа, отображённых
 * на ASCII-подобные коды (U+21 и далее). **Соответствие «сура N → код
 * глифа» неизвестно, и вывести его из имеющихся данных нельзя.**
 *
 * Подставить название суры из `src/content/surahs.ts`, а басмалу — обычным
 * арабским шрифтом технически можно. Но тогда это уже не мединский мусхаф
 * издания 1405, а его правдоподобная имитация: смесь шрифтов на странице,
 * где вся ценность — в точном соответствии печатному изданию. И басмала —
 * кораничный текст; подставлять его наугад нельзя тем более.
 *
 * Правило проекта на этот счёт прямое (`CLAUDE.md`, сакральные правила,
 * п. 8): нет контента с верным источником — не добавлять.
 *
 * ЧТО НУЖНО, ЧТОБЫ ДОДЕЛАТЬ: таблица соответствия «номер суры → код глифа
 * в QCF_BSML» из прослеживаемого источника, плюс такой же ответ про
 * басмалу. После этого скрипт достраивается двумя строками на страницу, а
 * рендер получает третий вариант шрифта.
 *
 * ── Запуск ────────────────────────────────────────────────────────────
 *
 *   node scripts/gen/fetch-qcf1-pages.mjs           # все 604 страницы
 *   node scripts/gen/fetch-qcf1-pages.mjs 1 10      # диапазон, для проверки
 *
 * Результат — `public/qcf1/pages/NNN.json`. Скрипт идемпотентен: повторный
 * запуск перезаписывает файлы теми же данными.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = resolve(ROOT, 'public/qcf1/pages');
const API_BASE = 'https://api.qurancdn.com/api/qdc/verses/by_page/';
const TOTAL_PAGES = 604;

/** QCF V1 — по шрифту на страницу; имя несёт номер, как требует правило №2. */
const fontFamily = page => `QCF_P${String(page).padStart(3, '0')}`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchPage(page, attempt = 1) {
  const fields = 'code_v1,text_uthmani,position,page_number,line_number,verse_key,char_type_name';
  // mushaf=2 — именно QCF V1. См. предупреждение в шапке файла.
  const url = `${API_BASE}${page}?words=true&word_fields=${fields}&per_page=all&mushaf=2`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (!Array.isArray(body.verses)) throw new Error('нет поля verses');
    return body.verses;
  } catch (error) {
    if (attempt >= 4) throw new Error(`страница ${page}: ${error.message}`);
    // Растущая пауза: у публичного API бывает ограничение частоты, и
    // упереться в него на 604 запросах легко.
    await sleep(400 * attempt);
    return fetchPage(page, attempt + 1);
  }
}

function buildPage(page, verses) {
  const byLine = new Map();
  const surahs = new Map();

  for (const verse of verses) {
    const [surahId] = verse.verse_key.split(':').map(Number);
    const ayah = Number(verse.verse_key.split(':')[1]);
    const known = surahs.get(surahId);
    if (!known) {
      surahs.set(surahId, { id: surahId, verse_start: ayah, verse_end: ayah });
    } else {
      known.verse_start = Math.min(known.verse_start, ayah);
      known.verse_end = Math.max(known.verse_end, ayah);
    }

    for (const word of verse.words ?? []) {
      // Слова соседних страниц в ответе встречаются: API отдаёт аят
      // целиком, даже если он пересекает границу страницы.
      if (word.page_number !== page) continue;
      if (!Number.isFinite(word.line_number)) continue;
      if (!word.code_v1) continue;

      const line = word.line_number;
      if (!byLine.has(line)) byLine.set(line, []);
      byLine.get(line).push({
        code: word.code_v1.codePointAt(0),
        char: word.code_v1,
        text: word.text_uthmani ?? '',
        type: word.char_type_name === 'end' ? 'end' : 'word',
        verse_key: word.verse_key,
        position: word.position,
      });
    }
  }

  // Приводим нумерацию к 1..N по минимальному номеру страницы, см. шапку.
  const ordered = [...byLine.entries()].sort((a, b) => a[0] - b[0]);
  const first = ordered.length > 0 ? ordered[0][0] : 1;

  return {
    page,
    font: fontFamily(page),
    surahs: [...surahs.values()].sort((a, b) => a.id - b.id),
    lines: ordered.map(([line, words], index) => ({
      line: line - first + 1,
      words,
      // Порядок строк обязан быть сплошным: дыра означала бы потерянную
      // строку мусхафа, а это не то, что можно заметить глазами.
      _gap: line - first !== index,
    })).map(({ _gap, ...rest }, index, all) => {
      if (_gap) {
        throw new Error(
          `страница ${page}: разрыв в нумерации строк на позиции ${index + 1} `
          + `(получено ${all.length} строк)`,
        );
      }
      return rest;
    }),
  };
}

async function main() {
  const from = Number(process.argv[2] ?? 1);
  const to = Number(process.argv[3] ?? TOTAL_PAGES);
  mkdirSync(OUT_DIR, { recursive: true });

  let bytes = 0;
  for (let page = from; page <= to; page++) {
    const verses = await fetchPage(page);
    const data = buildPage(page, verses);

    if (data.lines.length === 0) {
      throw new Error(`страница ${page}: не собралось ни одной строки`);
    }
    // Обычная страница мусхафа — пятнадцать строк. Первые две короче
    // (там начало Корана), последняя тоже. Всё остальное — повод сказать
    // вслух: молча отдать неполную страницу нельзя.
    if (data.lines.length !== 15 && page > 2 && page < TOTAL_PAGES) {
      console.warn(`  страница ${page}: строк ${data.lines.length}, обычно 15`);
    }

    const json = JSON.stringify(data);
    bytes += json.length;
    writeFileSync(resolve(OUT_DIR, `${String(page).padStart(3, '0')}.json`), json);
    if (page % 25 === 0 || page === to) {
      console.log(`  ${page}/${to}  (${(bytes / 1048576).toFixed(1)} МБ)`);
    }
    // Пауза между запросами: 604 обращения подряд к публичному API без неё
    // выглядят как атака и получают ограничение частоты.
    await sleep(120);
  }
  console.log(`Готово: страницы ${from}–${to}, ${(bytes / 1048576).toFixed(1)} МБ`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
