#!/usr/bin/env python3
"""
build-page-fonts — режет 48 шрифтов мусхафа на постраничные подмножества.

── Зачем ─────────────────────────────────────────────────────────────────

QCF V4 раздаёт Коран 48 файлами по ~780 КБ.  Каждый файл содержит 2073
готовых глифа-слова, и одни и те же PUA-коды в разных файлах означают
разные слова: пара (код, шрифт) — вот что задаёт слово.

Из-за этого на одну страницу мусхафа приходится качать в среднем 0.89 МБ,
местами 1.78 МБ, хотя странице нужно около 140 глифов из 2073.  Хуже
всего служебные шрифты: страница 77 тянет QCF4_Hafs_01 весом 924 КБ ради
ОДНОГО глифа — заголовка суры.

На нашем сервере это 1.6 секунды за файл, то есть 4-5 секунд на страницу,
и всё это время `font-display: block` держит текст невидимым, а потом
показывает кубики: у PUA-кодов нет запасного глифа ни в одном системном
шрифте.

Постраничный сабсет снимает проблему в корне: 2.26 МБ → 84 КБ (3.6%).

── Почему это безопасно для сакрального текста ────────────────────────────

Сабсеттинг не рисует и не меняет глифы — он выбрасывает из бинарника те,
что не нужны.  Формы букв остаются те же байты, что дал King Fahd Complex.

Но «должно быть безопасно» для мусхафа не годится, поэтому каждая
страница проверяется дважды, и скрипт падает при первом же расхождении:

  1. Покрытие: cmap подмножества содержит ВСЕ коды, которые встречаются
     на странице.  Потерянный глиф — это дыра в аяте на экране.
  2. Тождество: контур и ширина каждого глифа сверяются с оригиналом по
     хешу записи пера.  Любое искажение формы буквы — расхождение с
     мусхафом.

── Что на выходе ─────────────────────────────────────────────────────────

    public/qcf4/fonts-page/077/QCF4_Hafs_06.woff2

Семейство в CSS получает суффикс страницы — `QCF4_Hafs_06_p77`.  Без него
подмножества одного шрифта для разных страниц столкнулись бы в одном
`font-family`, и браузер отдал бы глиф не той страницы: то есть чужое
слово в аяте.  Имя внутри файла не трогаем — семейство задаёт `@font-face`.

── Запуск ────────────────────────────────────────────────────────────────

    python3 scripts/build-page-fonts.py            # все 604 страницы
    python3 scripts/build-page-fonts.py 1 10       # только страницы 1..10
    python3 scripts/build-page-fonts.py --check    # только проверить готовое

Идемпотентен: страница со свежим готовым файлом пропускается.
"""

import hashlib
import json
import os
import sys
import time
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed

from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options
from fontTools.pens.recordingPen import RecordingPen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES_DIR = os.path.join(ROOT, 'public', 'qcf4', 'pages')
# Исходные 48 шрифтов лежат ВНЕ public: в рантайме они не нужны, а в
# пакете приложения это были лишние 36 МБ.  Здесь они как источник для
# нарезки — и должны остаться в репозитории, чтобы её можно было
# повторить (например, когда King Fahd Complex обновит мусхаф).
SRC_DIR = os.path.join(ROOT, 'vendor', 'qcf4-fonts-woff2')
OUT_DIR = os.path.join(ROOT, 'public', 'qcf4', 'fonts-page')

FIRST_PAGE, LAST_PAGE = 1, 604


def src_file(font: str) -> str:
    """QCF4_Hafs_06 → QCF4_Hafs_06_W.woff2, QCF4_QBSML → QCF4_QBSML.woff2."""
    name = 'QCF4_QBSML.woff2' if font == 'QCF4_QBSML' else f'{font}_W.woff2'
    return os.path.join(SRC_DIR, name)


def out_file(page: int, font: str) -> str:
    return os.path.join(OUT_DIR, f'{page:03d}', f'{font}.woff2')


def page_json(page: int) -> str:
    return os.path.join(PAGES_DIR, f'{page:03d}.json')


def codes_per_font(page: int) -> dict:
    """Какие PUA-коды каких шрифтов встречаются на странице."""
    with open(page_json(page), encoding='utf-8') as fh:
        data = json.load(fh)
    per = defaultdict(set)
    for line in data['lines']:
        for word in line['words']:
            ch = word.get('char')
            if not ch:
                continue
            per[word['font']].add(ord(ch))
    return per


def fingerprints(font_path: str, codes) -> dict:
    """
    Отпечаток контура и ширины для каждого кода.

    Сверяет именно рисунок буквы, а не факт наличия глифа: сабсет обязан
    сохранить формы мусхафа побайтово, а не «примерно».
    """
    tt = TTFont(font_path)
    cmap = tt.getBestCmap()
    glyphs = tt.getGlyphSet()
    out = {}
    for code in codes:
        gname = cmap.get(code)
        if gname is None:
            out[code] = None
            continue
        pen = RecordingPen()
        glyphs[gname].draw(pen)
        out[code] = (
            hashlib.sha256(repr(pen.value).encode()).hexdigest(),
            round(glyphs[gname].width, 3),
        )
    tt.close()
    return out


def subset_one(font: str, codes: set, dst: str) -> int:
    """Вырезать из шрифта только нужные коды. Возвращает размер файла."""
    os.makedirs(os.path.dirname(dst), exist_ok=True)

    options = Options()
    options.flavor = 'woff2'
    # Формы мусхафа задаются таблицами разметки: без них лигатуры и
    # позиционирование огласовок поедут. Оставляем все фичи.
    options.layout_features = ['*']
    options.notdef_outline = True
    options.recalc_bounds = True
    options.drop_tables = []
    # Имя семейства берётся из @font-face, но осмысленное имя внутри файла
    # помогает, когда файл смотрят инструментами.
    options.name_IDs = ['*']
    options.name_legacy = True
    options.name_languages = ['*']

    tt = TTFont(src_file(font))
    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=codes)
    subsetter.subset(tt)
    tt.flavor = 'woff2'
    tt.save(dst)
    tt.close()
    return os.path.getsize(dst)


def verify(font: str, codes: set, dst: str) -> list:
    """Проверить покрытие и тождество глифов. Возвращает список претензий."""
    problems = []
    before = fingerprints(src_file(font), codes)
    after = fingerprints(dst, codes)

    for code in sorted(codes):
        if after.get(code) is None:
            problems.append(f'U+{code:04X} потерян в подмножестве')
        elif before.get(code) != after.get(code):
            problems.append(
                f'U+{code:04X} контур изменился: '
                f'{before.get(code)} → {after.get(code)}'
            )
    return problems


def build_page(page: int, check_only: bool) -> dict:
    """Собрать (или проверить) все подмножества одной страницы."""
    result = {'page': page, 'fonts': [], 'bytes_before': 0,
              'bytes_after': 0, 'problems': [], 'skipped': 0}
    try:
        per = codes_per_font(page)
    except FileNotFoundError:
        result['problems'].append(f'нет {page:03d}.json')
        return result

    for font, codes in sorted(per.items()):
        src = src_file(font)
        if not os.path.exists(src):
            result['problems'].append(f'нет исходного шрифта {font}')
            continue
        dst = out_file(page, font)

        fresh = (
            os.path.exists(dst)
            and os.path.getmtime(dst) > os.path.getmtime(src)
            and os.path.getmtime(dst) > os.path.getmtime(page_json(page))
        )
        if check_only and not os.path.exists(dst):
            result['problems'].append(f'{font}: файл не собран')
            continue
        if not fresh and not check_only:
            subset_one(font, codes, dst)
        elif fresh and not check_only:
            result['skipped'] += 1

        result['problems'] += [f'{font}: {p}' for p in verify(font, codes, dst)]
        result['bytes_before'] += os.path.getsize(src)
        result['bytes_after'] += os.path.getsize(dst)
        result['fonts'].append(font)

    return result


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    check_only = '--check' in sys.argv
    first = int(args[0]) if len(args) > 0 else FIRST_PAGE
    last = int(args[1]) if len(args) > 1 else (first if args else LAST_PAGE)

    pages = [p for p in range(first, last + 1) if os.path.exists(page_json(p))]
    print(f'{"Проверка" if check_only else "Сборка"}: страницы {first}..{last} '
          f'({len(pages)} шт.), выход {os.path.relpath(OUT_DIR, ROOT)}')

    started = time.time()
    before = after = skipped = 0
    problems = []
    done = 0

    with ProcessPoolExecutor() as pool:
        futures = {pool.submit(build_page, p, check_only): p for p in pages}
        for fut in as_completed(futures):
            r = fut.result()
            before += r['bytes_before']
            after += r['bytes_after']
            skipped += r['skipped']
            problems += [f'стр {r["page"]}: {p}' for p in r['problems']]
            done += 1
            if done % 50 == 0 or done == len(pages):
                print(f'  {done}/{len(pages)} страниц, '
                      f'{time.time() - started:.0f}s')

    print()
    if before:
        print(f'Было бы скачано: {before / 1024 / 1024:.0f} МБ '
              f'({before / len(pages) / 1024 / 1024:.2f} МБ на страницу)')
        print(f'Стало:           {after / 1024 / 1024:.1f} МБ '
              f'({after / len(pages) / 1024:.0f} КБ на страницу, '
              f'{after / before * 100:.1f}%)')
    if skipped:
        print(f'Пропущено готовых: {skipped}')

    if problems:
        print(f'\nПРОБЛЕМЫ ({len(problems)}):')
        for p in problems[:40]:
            print('  ' + p)
        if len(problems) > 40:
            print(f'  ... ещё {len(problems) - 40}')
        return 1

    print('\nВсе глифы на месте, контуры совпадают с оригиналом.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
