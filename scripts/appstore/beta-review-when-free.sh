#!/usr/bin/env bash
# Сторож бета-проверки TestFlight.
#
# Apple пускает на Beta App Review только одну сборку из поезда версии за раз:
# пока предыдущая на проверке, новая получает 422 «Another build is in review».
# Отправлять руками некому — у владельца нет доступа в App Store Connect, а
# публичная ссылка до прохождения проверки отдаёт СТАРУЮ сборку.
#
# Скрипт повторяет попытку, пока очередь не освободится. Коды возврата
# attach-testflight.mjs: 0 — отправлено или уже идёт, 2 — очередь занята,
# 1 — настоящая ошибка (тогда прекращаем и не делаем вид, что всё хорошо).
#
# Имена переменных только латиницей — bash кириллицу в именах не принимает,
# на этом уже обожглись в publish-when-ready.sh (06.09.2026).
set -u
cd "$(dirname "$0")/../.."
export ASC_ISSUER_ID=cdd3af45-fbd3-4d29-a8c4-d5b622e90054
export ASC_KEY_ID=4239FJ4XKF
export ASC_KEY_PATH=secrets/AuthKey_4239FJ4XKF.p8

build="${1:?укажите номер сборки}"
tries="${2:-96}"   # по умолчанию сутки при шаге 15 минут

for i in $(seq 1 "$tries"); do
  out="$(node scripts/appstore/attach-testflight.mjs "$build" 2>&1)"
  code=$?
  echo "$(date +%H:%M:%S)  $(echo "$out" | tail -1)"
  case "$code" in
    0) echo "готово: сборка $build открыта тестировщикам"; exit 0 ;;
    2) sleep 900 ;;
    *) echo "остановился: это не очередь, а ошибка"; exit 1 ;;
  esac
done
echo "очередь не освободилась за отведённое время — сборка $build ждёт"
exit 1
