#!/usr/bin/env bash
# Доводит выпуск до конца без участия человека:
#   1) ждёт, пока сборка обработается, и кладёт её в TestFlight;
#   2) ждёт, пока освободится очередь ревью, и отправляет версию в магазин.
#
# Два шага НАМЕРЕННО независимы. TestFlight не должен ждать очереди магазина:
# внутренним тестировщикам сборка доступна сразу после обработки, и владелец
# может смотреть правки, пока предыдущая версия ещё на проверке.
set -u
cd "$(dirname "$0")/../.."
export ASC_ISSUER_ID=cdd3af45-fbd3-4d29-a8c4-d5b622e90054
export ASC_KEY_ID=4239FJ4XKF
export ASC_KEY_PATH=secrets/AuthKey_4239FJ4XKF.p8

нужная="${1:?укажите номер сборки}"

обработана() {
  node --input-type=module -e "
import { credentialsFromEnv, ascGet } from './scripts/appstore/asc-client.mjs';
const c = credentialsFromEnv();
const b = await ascGet('/v1/apps/6802455200/builds', c, { limit: 20 });
const x = b.data.find(v => v.attributes.version === '${нужная}');
console.log(x ? x.attributes.processingState : 'нет');
" 2>/dev/null
}

for i in $(seq 1 30); do
  s="$(обработана)"
  echo "$(date +%H:%M:%S)  сборка ${нужная}: $s"
  [ "$s" = "VALID" ] && break
  sleep 60
done

node scripts/appstore/attach-testflight.mjs || echo "не удалось положить в TestFlight"

состояние() {
  node --input-type=module -e "
import { credentialsFromEnv, ascGet } from './scripts/appstore/asc-client.mjs';
const c = credentialsFromEnv();
const vs = await ascGet('/v1/apps/6802455200/appStoreVersions', c, { limit: 1 });
console.log(vs.data[0].attributes.versionString + ' ' + vs.data[0].attributes.appStoreState);
" 2>/dev/null
}

for i in $(seq 1 60); do
  s="$(состояние)"
  echo "$(date +%H:%M:%S)  верхняя версия: $s"
  case "$s" in
    *WAITING_FOR_REVIEW|*IN_REVIEW|*PENDING_DEVELOPER_RELEASE) sleep 300 ;;
    *) echo "очередь свободна — отправляю"; npm run asc:submit -- --submit 2>&1 | tail -8; exit 0 ;;
  esac
done
echo "очередь так и не освободилась — TestFlight обновлён, магазин отправлю следующим заходом"
