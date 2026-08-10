/**
 * Разрез Корана по джузам — 30 частей, в каждой суры с точными
 * границами аятов.
 *
 * Зачем отдельным модулем, а не внутри экрана: это арифметика, а
 * арифметика границ ломается молча.  Сдвинется на единицу — джуз
 * начнётся не с того аята, и увидеть это глазами на экране почти
 * невозможно: цифры выглядят правдоподобно.  Здесь она лежит там,
 * откуда её берут тесты (`npm test`), а экран только рисует.
 *
 * Почему джузы не могут быть заголовками в списке сур.  Джузы 2 и 5
 * начинаются посреди Аль-Бакары и Ан-Нисы — ни одна сура в них не
 * начинается.  Заголовки в плоском списке дают «1 → 3 → 4 → 6», и это
 * не опечатка, а свойство деления.  Поэтому джузы — свой список.
 */

import { SURAH_BY_NUMBER, type SurahMeta } from '../content/surahs';
import { JUZ_STARTS, ayahsInSurah, TOTAL_SURAHS } from './ayahNumbering';

export type JuzRow = {
  meta: SurahMeta;
  /** Первый и последний аят суры, попадающие в этот джуз. */
  from: number;
  to: number;
  /** Сура целиком помещается в этот джуз. */
  whole: boolean;
};

export type JuzSection = { juz: number; rows: JuzRow[] };

/** Аят, предшествующий данному, — то есть конец предыдущего джуза. */
function previousAyah(surah: number, ayah: number): [number, number] {
  return ayah > 1 ? [surah, ayah - 1] : [surah - 1, ayahsInSurah(surah - 1)];
}

/**
 * 30 джузов.  Считается один раз на модуль: данные неизменны, а
 * пересобирать их на каждый рендер незачем.
 */
export const JUZ_SECTIONS: JuzSection[] = (() => {
  const out: JuzSection[] = [];
  for (let j = 1; j <= 30; j++) {
    const [startSurah, startAyah] = JUZ_STARTS[j - 1];
    const [endSurah, endAyah] = j === 30
      ? [TOTAL_SURAHS, ayahsInSurah(TOTAL_SURAHS)]
      : previousAyah(JUZ_STARTS[j][0], JUZ_STARTS[j][1]);

    const rows: JuzRow[] = [];
    for (let s = startSurah; s <= endSurah; s++) {
      const meta = SURAH_BY_NUMBER[s];
      if (!meta) continue;
      const from = s === startSurah ? startAyah : 1;
      const to = s === endSurah ? endAyah : ayahsInSurah(s);
      rows.push({ meta, from, to, whole: from === 1 && to === ayahsInSurah(s) });
    }
    out.push({ juz: j, rows });
  }
  return out;
})();
