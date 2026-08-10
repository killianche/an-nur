# assets-optional

Ассеты, которые лежат в репозитории, но **намеренно не попадают в сборку**.
Vite копирует в `dist/` только содержимое `public/`, поэтому достаточно
держать папку здесь, чтобы она не оказалась в приложении.

## `fonts/` — 604 постраничных шрифта цветного таджвида (158 МБ)

Режим «Таджвид» временно скрыт (см. `TAJWEED_ENABLED` в
`src/lib/typography.ts`). Шрифты обязаны лежать в пакете, а не
скачиваться: цвет на iPhone берётся из SVG-таблицы, а публичный CDN
Quran Foundation отдаёт только COLRv1, который Safari не поддерживает.
Проверено 2026-08-10: у апстрим-файла таблицы SVG нет.

Вернуть режим — три шага:

1. `TAJWEED_ENABLED = true` в `src/lib/typography.ts`;
2. `git mv assets-optional/fonts public/fonts`;
3. раскомментировать `@import "./styles/tajweed-fonts.css"` в `src/index.css`.
