/**
 * Клиент App Store Connect API.
 *
 * ── Что этим можно и чего нельзя ──────────────────────────────────────────
 *
 * МОЖНО без Mac: читать состояние приложения и сборок, править метаданные
 * карточки («Что нового», описание, ключевые слова), загружать скриншоты,
 * управлять TestFlight, выбирать уже загруженную сборку и отправлять версию
 * на ревью.
 *
 * НЕЛЬЗЯ ничем и никак: создать сам файл сборки. Архив собирает Xcode, он
 * существует только под macOS, и никакой ключ этого не меняет. Загрузка
 * бинарника в App Store Connect тоже идёт с Mac (Xcode Organizer или
 * Transporter). То есть порядок всегда такой: Mac загружает сборку → всё
 * остальное можно доделать отсюда.
 *
 * ── Аутентификация ────────────────────────────────────────────────────────
 *
 * Apple подписывает запросы коротким JWT на эллиптической кривой P-256
 * (алгоритм ES256). Нужны три вещи из App Store Connect → Users and Access →
 * Integrations → App Store Connect API:
 *
 *   ASC_ISSUER_ID  — один на всю команду, вида 69a6de70-....
 *   ASC_KEY_ID     — идентификатор конкретного ключа, 10 символов
 *   ASC_KEY_PATH   — путь к файлу AuthKey_XXXXXXXXXX.p8
 *
 * Файл .p8 Apple даёт скачать ОДИН раз. В репозиторий он не кладётся никогда:
 * `.gitignore` держит и `*.p8`, и весь каталог `secrets/`. Ключ отзывается в
 * том же разделе одной кнопкой — если он утёк или больше не нужен.
 *
 * Права ключа выбираются при создании. Для работы с карточкой и отправки на
 * ревью достаточно роли App Manager; Admin и Account Holder не нужны.
 *
 * Токен живёт максимум 20 минут — более долгий Apple отвергает. Здесь он
 * выпускается на 15 и пересоздаётся по необходимости.
 */
import { sign as cryptoSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const API = 'https://api.appstoreconnect.apple.com';

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Подписанный JWT для App Store Connect.
 *
 * Тонкость, на которой легко потерять час: JWS требует подпись в формате
 * R‖S фиксированной длины (P1363), а Node по умолчанию отдаёт ECDSA в DER.
 * Отсюда `dsaEncoding: 'ieee-p1363'` — без него Apple отвечает 401 без
 * объяснений.
 */
export function makeToken({ issuerId, keyId, privateKey }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 15 * 60,          // Apple не принимает больше 20 минут
    aud: 'appstoreconnect-v1',
  };
  const signingInput =
    `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = cryptoSign(
    'sha256',
    Buffer.from(signingInput),
    { key: privateKey, dsaEncoding: 'ieee-p1363' },
  );
  return `${signingInput}.${base64url(signature)}`;
}

/** Читает доступы из переменных окружения и проверяет, что они на месте. */
export function credentialsFromEnv() {
  const issuerId = process.env.ASC_ISSUER_ID;
  const keyId = process.env.ASC_KEY_ID;
  const keyPath = process.env.ASC_KEY_PATH;

  const missing = [
    !issuerId && 'ASC_ISSUER_ID',
    !keyId && 'ASC_KEY_ID',
    !keyPath && 'ASC_KEY_PATH',
  ].filter(Boolean);

  if (missing.length) {
    throw new Error(
      `Не заданы: ${missing.join(', ')}.\n`
      + 'Где взять — см. RELEASE.md, раздел «Доступ к App Store Connect».',
    );
  }
  return { issuerId, keyId, privateKey: readFileSync(keyPath, 'utf8') };
}

/**
 * GET к API. Возвращает разобранный JSON.
 *
 * Ошибки Apple приходят структурой `{ errors: [{ title, detail }] }` — их
 * стоит показать целиком: по одному коду состояния причину не понять.
 */
export async function ascGet(path, credentials, params = {}) {
  const token = makeToken(credentials);
  const url = new URL(path.startsWith('http') ? path : `${API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.text();

  if (!response.ok) {
    let detail = body;
    try {
      const parsed = JSON.parse(body);
      detail = (parsed.errors ?? [])
        .map(e => `${e.title}: ${e.detail ?? ''}`.trim())
        .join('\n') || body;
    } catch { /* оставляем как есть */ }
    throw new Error(`App Store Connect ${response.status}\n${detail}`);
  }
  return JSON.parse(body);
}
