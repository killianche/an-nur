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
# 🔴 Идентификаторы Apple НЕ в коде.
#
# 07.09.2026 репозиторий стал публичным ради снятия лимита минут Actions. До
# этого issuer id и key id лежали прямо здесь. Сами по себе они не пускают
# никуда — без приватного ключа .p8 подписать запрос нечем, а он в git не
# попадал ни разу, — но публиковать их незачем.
#
# Доступы теперь в secrets/asc.env: каталог целиком в .gitignore, там же лежит
# сам ключ. Образец — в secrets/README.md.
if [ -f secrets/asc.env ]; then
  # shellcheck disable=SC1091
  . secrets/asc.env
fi
: "${ASC_ISSUER_ID:?нет доступа к App Store Connect — создайте secrets/asc.env, образец в secrets/README.md}"
: "${ASC_KEY_ID:?нет ASC_KEY_ID — см. secrets/README.md}"
: "${ASC_KEY_PATH:?нет ASC_KEY_PATH — см. secrets/README.md}"

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
