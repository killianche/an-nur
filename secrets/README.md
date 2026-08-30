# Каталог для ключа App Store Connect

Сюда кладётся файл `AuthKey_XXXXXXXXXX.p8`, скачанный в App Store Connect →
Users and Access → Integrations → App Store Connect API.

**Содержимое каталога в git не попадает** — он целиком в `.gitignore`, как и
любые файлы `*.p8`. Этот README — единственное исключение, он добавлен
принудительно, чтобы каталог существовал и было видно, что сюда класть.

Apple даёт скачать ключ **один раз**. Потеряли — выпускайте новый и отзывайте
старый там же.

Запуск проверки доступа:

```bash
ASC_ISSUER_ID=<issuer id> \
ASC_KEY_ID=<key id> \
ASC_KEY_PATH=secrets/AuthKey_XXXXXXXXXX.p8 \
npm run asc:status
```

Подробности — `RELEASE.md`, раздел «Доступ к App Store Connect».
