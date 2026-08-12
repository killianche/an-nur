#!/usr/bin/env python3
"""
Сборка public/dua/dua.json — 30 кораничных дуа.

Источники и что откуда берётся:

  • СПИСОК дуа, порядок, ссылки на аяты, транскрипция — из PDF владельца
    «30 дуа из Корана в месяц Рамадан» (~/Desktop/QuranIng).
  • АРАБСКИЙ и ПЕРЕВОД — из данных проекта (src/content/quran-sources.ts,
    editions ar-simple-clean и ru-kuliev). Из PDF они НЕ переносятся:
    при извлечении арабский рассыпается (лигатура «Аллах» распадается,
    выравнивание набивает растяжки-тatweel), а в переводе PDF есть
    опечатки («защит» вместо «защити»). Перевод Кулиева зафиксирован для
    проекта, поэтому берём его — тот же текст, что читается в Коране
    приложения.
  • ГРАНИЦЫ фрагмента внутри аята — сняты глазами со страниц PDF и лежат
    в dua-bounds.json как первые (и, где нужно, последние) слова.

Дуа почти всегда фрагмент аята, а не аят целиком: например, №3 и №4 — две
разные мольбы внутри 2:286. Правила проекта это допускают при явной
атрибуции, поэтому у каждой записи стоит ссылка сура:аят.
"""

import io
import json
import re
import sys

ROOT = '/Users/ruslancherbizhev/Desktop/QuranRu'
S = ('/private/tmp/claude-501/-Users-ruslancherbizhev-Desktop-QuranIng/'
     'fe7d374a-d0ee-4703-85a5-4179c15dcd6f/scratchpad')

DIACRITICS = re.compile(r'[ً-ٰٟۖ-ۭـ]')

def norm_ar(s):
    s = DIACRITICS.sub('', s)
    for a, b in (('ٱ','ا'), ('آ','ا'), ('أ','ا'), ('إ','ا'),
                 ('ى','ي'), ('ة','ه'), ('ؤ','و'), ('ئ','ي'),
                 # Отдельная хамза: в издании «ءَاتِنَا», в мольбе «آتِنَا» —
                 # одно и то же слово, разная запись.
                 ('ء','')):
        s = s.replace(a, b)
    return re.sub(r'\s+', '', s)

def load_sources():
    s = io.open(f'{ROOT}/src/content/quran-sources.ts', encoding='utf-8').read()
    out = {}
    for m in re.finditer(
        r"'(\d+:\d+)': \{ surah: (\d+), ayah: (\d+), arabic: '((?:[^'\\]|\\.)*)', "
        r"translations: \{ ru: '((?:[^'\\]|\\.)*)' \}", s):
        key, _, _, ar, ru = m.groups()
        unesc = lambda t: t.replace("\\'", "'").replace('\\\\', '\\')
        out[key] = {'arabic': unesc(ar), 'russian': unesc(ru)}
    return out

def cut(full, frm, to=None):
    """
    Вырезать фрагмент из текста аята по нормализованным границам.

    Возвращает срез ИСХОДНОГО текста, поэтому в результат попадают ровно
    те байты, что дал источник: огласовки, знаки паузы, васлы — всё на
    месте.
    """
    idx, buf = [], []
    for i, ch in enumerate(full):
        n = norm_ar(ch)
        if n:
            buf.append(n)
            idx.append(i)
    hay = ''.join(buf)

    a = hay.find(norm_ar(frm))
    if a < 0:
        return None, f'начало не найдено: {frm}'
    start = idx[a]

    if to:
        nt = norm_ar(to)
        b = hay.find(nt, a)
        if b < 0:
            return None, f'конец не найден: {to}'
        end = idx[b + len(nt) - 1]
    else:
        end = len(full) - 1
    return full[start:end + 1].strip(), None

def norm_ru(s):
    """Для поиска: без пунктуации, регистра и кавычек-ёлочек."""
    s = s.lower().replace('ё', 'е')
    return re.sub(r'[^а-я0-9 ]+', '', s)

def cut_ru(full, pdf_ru):
    """
    Вырезать из перевода Кулиева ту же часть, что цитирует PDF.

    Перевод берём свой (в PDF есть опечатки — «защит» вместо «защити»),
    а границы — по PDF: там процитирована именно мольба, без повествования
    вокруг неё.  Иначе на карточке дуа читалось бы «Вот Ибрахим и Исмаил
    подняли основание Дома…», хотя человек искал саму мольбу.

    Ищем по первым и последним словам: середина могла разойтись из-за той
    же опечатки.
    """
    if not pdf_ru:
        return full
    words_full = full.split()
    nf = [norm_ru(w) for w in words_full]
    pw = [norm_ru(w) for w in pdf_ru.split() if norm_ru(w)]
    if len(pw) < 3:
        return full

    def find(seq, start=0):
        for i in range(start, len(nf) - len(seq) + 1):
            if nf[i:i + len(seq)] == seq:
                return i
        return -1

    a = -1
    for k in (4, 3, 2):
        a = find(pw[:k])
        if a >= 0:
            break
    if a < 0:
        return full
    b = -1
    for k in (4, 3, 2):
        b = find(pw[-k:], a)
        if b >= 0:
            b += k
            break
    if b < 0:
        b = len(words_full)
    frag = ' '.join(words_full[a:b]).strip()

    # Непарные кавычки-ёлочки на краях фрагмента.
    #
    # У Кулиева мольба стоит внутри прямой речи: «Господь наш! …». Вырезая
    # её из аята, мы забираем открывающую кавычку без закрывающей, и на
    # карточке висит одинокая «. Это обрамление речи, а не слова мольбы,
    # поэтому непарную кавычку снимаем — сами слова не меняются.
    if frag.startswith('«') and '»' not in frag:
        frag = frag[1:].lstrip()
    if frag.endswith('»') and '«' not in frag:
        frag = frag[:-1].rstrip()
    return frag

def parse_pdf():
    """Транскрипции, перевод и ссылки из текстового слоя PDF (-layout)."""
    s = io.open(f'{S}/dua-layout.txt', encoding='utf-8').read()
    s = re.sub(r'[‪-‮‎‏⁦-⁩]', '', s)
    parts = re.split(r'Дуа\s*№\s*(\d+)', s)
    out = {}
    for i in range(1, len(parts), 2):
        num, body = int(parts[i]), parts[i + 1]
        lines = [l.strip() for l in body.split('\n') if l.strip()]
        lines = [l for l in lines if not re.fullmatch(r'\d+', l)]
        translit, russian, ref = [], [], None
        in_ru = False
        for l in lines:
            if not re.search(r'[А-Яа-яЁё]', l):
                continue
            m = re.fullmatch(r'([А-ЯЁ][А-Яа-яёЁ\- ]{2,30}),\s*(\d+(?:\s*[-–]\s*\d+)?)', l)
            if m:
                ref = f'{m.group(1).strip()}, {m.group(2).replace(" ", "")}'
                break
            # Перевод начинается с обращения — до него всё транскрипция.
            if not in_ru and re.match(r'(Господь|Господи|Ты\b|Воистину|Надели|Мы\b|Аллах)', l):
                in_ru = True
            (russian if in_ru else translit).append(l)
        out[num] = {
            'translit': re.sub(r'\s+', ' ', ' '.join(translit)).strip(),
            'russian': re.sub(r'\s+', ' ', ' '.join(russian)).strip(),
            'ref': ref,
        }
    return out

# Заголовок карточки: о чём просят.  Снят с самого текста дуа, чтобы в
# списке было видно, что искать, — в PDF заголовков нет.
TITLES = {
    1:  'О принятии дел',              2:  'О благе в двух мирах',
    3:  'О прощении забывчивости',      4:  'О посильном бремени и помощи',
    5:  'Об укреплении на прямом пути', 6:  'О прощении и стойкости',
    7:  'О прощении грехов',            8:  'Об удЕле',
    9:  'О признании несправедливости', 10: 'О справедливом решении',
    11: 'О терпении',                   12: 'О прощении и милости',
    13: 'О защите от неведения',        14: 'О смерти в покорности',
    15: 'О намазе для себя и потомства',16: 'О прощении для родителей',
    17: 'О милости к родителям',        18: 'О милости и верном пути',
    19: 'Об облегчении дела и речи',    20: 'О приумножении знания',
    21: 'При беде и болезни',           22: 'О защите от наваждений',
    23: 'О прощении и милосердии',      24: 'О защите от мучений Геенны',
    25: 'О семье и потомстве',          26: 'О знании и праведниках',
    27: 'О благодарности за милость',   28: 'О прощении для верующих',
    29: 'О доме в Раю',                 30: 'О прощении для входящих в дом',
}

def main():
    src = load_sources()
    bounds = json.load(io.open(f'{S}/dua-bounds.json', encoding='utf-8'))
    pdf = parse_pdf()

    entries, problems = [], []
    for n in range(1, 31):
        b = bounds.get(str(n))
        if not b:
            problems.append(f'#{n}: нет границ')
            continue
        key = b['key']
        surah, ayahs = key.split(':')
        nums = [int(x) for x in re.split(r'[-–]', ayahs)]
        keys = [f'{surah}:{a}' for a in range(nums[0], nums[-1] + 1)]
        missing = [k for k in keys if k not in src]
        if missing:
            problems.append(f'#{n} {key}: нет аятов {missing}')
            continue

        full_ar = ' '.join(src[k]['arabic'] for k in keys)
        full_ru = ' '.join(src[k]['russian'] for k in keys)

        arabic, err = cut(full_ar, b['from'], b.get('to'))
        if err:
            problems.append(f'#{n} {key}: {err}')
            continue

        entries.append({
            'id': f'quran-{surah}-{ayahs}-{n}',
            'category': 'quran',
            'title_ru': TITLES[n],
            'arabic': arabic,
            'translit_ru': pdf[n]['translit'],
            'russian': cut_ru(full_ru, pdf[n]['russian']),
            'refs': [f'Коран {key}'],
        })

    data = {
        'version': 1,
        'categories': [{
            'id': 'quran',
            'title_ru': 'Дуа из Корана',
            'subtitle_ru': 'Мольбы, которым учит сам Коран',
        }],
        'entries': entries,
    }
    io.open(f'{ROOT}/public/dua/dua.json', 'w', encoding='utf-8').write(
        json.dumps(data, ensure_ascii=False, indent=1) + '\n')

    print(f'записей: {len(entries)} из 30')
    if problems:
        print('\nПРОБЛЕМЫ:')
        for p in problems:
            print('  ' + p)
        return 1
    for e in entries[:2]:
        print(f"\n{e['refs'][0]} — {e['title_ru']}")
        print('  ар:', e['arabic'])
        print('  тр:', e['translit_ru'][:80])
    return 0

if __name__ == '__main__':
    sys.exit(main())
