#!/usr/bin/env bash
# Ждёт, пока освободится очередь ревью, и отправляет готовую версию сам.
#
# Apple держит на проверке одну версию за раз. Пока предыдущая в очереди,
# следующую нельзя даже создать — поэтому вместо ручного «посмотри и отправь»
# ждём смены состояния и отправляем.
#
# Останавливается сам: и по успеху, и по исчерпании попыток.
set -u
cd "$(dirname "$0")/../.."
export ASC_ISSUER_ID=cdd3af45-fbd3-4d29-a8c4-d5b622e90054
export ASC_KEY_ID=4239FJ4XKF
export ASC_KEY_PATH=secrets/AuthKey_4239FJ4XKF.p8

состояние() {
  node --input-type=module -e "
import { credentialsFromEnv, ascGet } from './scripts/appstore/asc-client.mjs';
const c = credentialsFromEnv();
const vs = await ascGet('/v1/apps/6802455200/appStoreVersions', c, { limit: 1 });
console.log(vs.data[0].attributes.versionString + ' ' + vs.data[0].attributes.appStoreState);
" 2>/dev/null
}

for i in $(seq 1 40); do
  s="$(состояние)"
  echo "$(date +%H:%M:%S)  верхняя версия: $s"
  case "$s" in
    *WAITING_FOR_REVIEW|*IN_REVIEW|*PENDING_DEVELOPER_RELEASE)
      sleep 300 ;;
    *)
      echo "очередь свободна — отправляю"
      npm run asc:submit -- --submit 2>&1 | tail -8
      exit 0 ;;
  esac
done
echo "очередь так и не освободилась за отведённое время — отправлю в следующий заход"
