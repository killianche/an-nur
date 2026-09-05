/**
 * prune-dev-certs — чистка сертификатов разработчика, созданных сборкой.
 *
 * ── Зачем ─────────────────────────────────────────────────────────────
 *
 * Облачная сборка идёт на чистой машине: в её связке ключей ничего нет,
 * поэтому `xcodebuild -allowProvisioningUpdates` каждый раз выпускает НОВЫЙ
 * сертификат разработчика. Они копятся, и на тринадцатом Apple отвечает
 * «Choose a certificate to revoke. Your account has reached the maximum
 * number of certificates» — сборка падает на шаге архива. Так и случилось
 * 05.09.2026: 12 накопленных сертификатов, все с подписью «Created via API».
 *
 * Поэтому перед каждым архивом отзываем свои же прошлые: они одноразовые,
 * закрытый ключ от них остался на уничтоженной машине и никому не нужен.
 *
 * ── Что НЕ трогаем ────────────────────────────────────────────────────
 *
 * Только `DEVELOPMENT` и только с именем `Created via API`. Распространительный
 * сертификат (им подписывается то, что уходит в App Store) и личные
 * сертификаты владельца остаются нетронутыми — по имени их видно сразу.
 * Отзыв необратим, поэтому фильтр здесь узкий намеренно.
 */

import { credentialsFromEnv, ascGet, ascSend } from './asc-client.mjs';

const СЛУЖЕБНОЕ_ИМЯ = 'Created via API';

const credentials = credentialsFromEnv();
const { data } = await ascGet('/v1/certificates', credentials, { limit: 200 });

const свои = data.filter(c =>
  c.attributes.certificateType === 'DEVELOPMENT'
  && String(c.attributes.displayName || c.attributes.name || '') === СЛУЖЕБНОЕ_ИМЯ);

if (свои.length === 0) {
  console.log('Чистить нечего: сертификатов сборки нет.');
  process.exit(0);
}

let отозвано = 0;
for (const c of свои) {
  try {
    await ascSend('DELETE', `/v1/certificates/${c.id}`, undefined, credentials);
    отозвано++;
  } catch (error) {
    // Не роняем сборку: даже частичная чистка освобождает место под новый
    // сертификат, а ради упавшей уборки терять релиз незачем.
    console.warn(`Не удалось отозвать ${c.id}: ${String(error).slice(0, 120)}`);
  }
}

console.log(`Отозвано сертификатов сборки: ${отозвано} из ${свои.length}.`);
