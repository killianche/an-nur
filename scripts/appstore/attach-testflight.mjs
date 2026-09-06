/**
 * attach-testflight — положить сборку в TestFlight и открыть её тестировщикам.
 *
 * ── Зачем ─────────────────────────────────────────────────────────────
 *
 * Выгруженная сборка сама по себе НЕ попадает к тестировщикам: её нужно
 * привязать к группе. Пока группы не было, выгруженное просто лежало в App
 * Store Connect, и владелец не мог поставить его на телефон — это выяснилось
 * 06.09.2026, когда он попросил выкладывать и в TestFlight тоже.
 *
 * Скрипт делает три вещи:
 *   1) находит сборку по номеру;
 *   2) добавляет её в КАЖДУЮ группу, где её ещё нет;
 *   3) если среди них есть внешняя — отправляет сборку на Beta App Review,
 *      без которого публичная ссылка отдаёт старую сборку.
 *
 * Вызывается после выгрузки, отдельно от отправки в App Store: TestFlight и
 * магазин — разные пути, и один не должен ждать другого.
 *
 * Идемпотентен: повторный вызов на уже привязанной сборке безвреден.
 */

import { credentialsFromEnv, ascGet, ascSend } from './asc-client.mjs';

const APP = '6802455200';

const credentials = credentialsFromEnv();

const группы = await ascGet(`/v1/apps/${APP}/betaGroups`, credentials, { limit: 10 });
if (группы.data.length === 0) {
  console.error('Группы тестировщиков нет — сборку некуда класть.');
  process.exit(1);
}

const сборки = await ascGet(`/v1/apps/${APP}/builds`, credentials, { limit: 20 });
const готовые = сборки.data.filter(b => b.attributes.processingState === 'VALID');
if (готовые.length === 0) {
  console.error('Обработанных сборок нет — ещё рано.');
  process.exit(1);
}

// 🔴 Номер сборки берём АРГУМЕНТОМ, а не «самую свежую».
//
// 06.09.2026 скрипт положил в TestFlight сборку 15 вместо только что
// выгруженной 16: на момент вызова 16 ещё не была обработана, и «самая
// свежая обработанная» означала предыдущую. Отчёт при этом выглядел успешным.
// С явным номером такой тихой подмены не будет: если нужной сборки нет —
// честная ошибка.
const нужный = process.argv[2];
const сборка = нужный
  ? готовые.find(b => b.attributes.version === String(нужный))
  : готовые.reduce((a, b) =>
    Number(b.attributes.version) > Number(a.attributes.version) ? b : a);

if (!сборка) {
  console.error(`Сборки ${нужный} среди обработанных нет — класть в TestFlight нечего.`);
  process.exit(1);
}

const номер = сборка.attributes.version;

// 🔴 Обходим ВСЕ группы, а не только внутреннюю.
//
// Прежняя версия брала одну группу (предпочитая внутреннюю) и выходила. Внешняя
// группа с публичной ссылкой при этом оставалась на старой сборке — а владелец
// ставит приложение именно по ссылке, потому что доступа в App Store Connect у
// него нет.
let внешняя = false;
for (const группа of группы.data) {
  const вГруппе = await ascGet(`/v1/betaGroups/${группа.id}/builds`, credentials, { limit: 50 });
  if (вГруппе.data.some(b => b.id === сборка.id)) {
    console.log(`сборка ${номер}: уже в группе «${группа.attributes.name}»`);
  } else {
    await ascSend('POST', `/v1/betaGroups/${группа.id}/relationships/builds`,
      { data: [{ type: 'builds', id: сборка.id }] }, credentials);
    console.log(`сборка ${номер}: добавлена в группу «${группа.attributes.name}»`);
  }
  if (!группа.attributes.isInternalGroup) внешняя = true;
}

if (!внешняя) {
  console.log(`сборка ${номер}: внешних групп нет — бета-проверка не нужна.`);
  process.exit(0);
}

const заявка = await ascGet(`/v1/builds/${сборка.id}/betaAppReviewSubmission`, credentials)
  .catch(() => null);
if (заявка?.data) {
  console.log(`сборка ${номер}: бета-проверка уже идёт — ${заявка.data.attributes.betaReviewState}`);
  process.exit(0);
}

try {
  const создана = await ascSend('POST', '/v1/betaAppReviewSubmissions',
    { data: { type: 'betaAppReviewSubmissions', relationships: { build: { data: { type: 'builds', id: сборка.id } } } } },
    credentials);
  console.log(`сборка ${номер}: отправлена на бета-проверку — ${создана.data.attributes.betaReviewState}`);
} catch (ошибка) {
  // Пока предыдущая сборка того же поезда версии на бета-проверке, Apple
  // отказывает: «Another build is in review. — Another build in the same train
  // is already in beta review.» Это не поломка, а очередь: код возврата 2
  // отличает её от настоящей ошибки, чтобы сторож повторил попытку позже.
  //
  // Проверяем по «another build», а не по «already in review»: первая формулировка
  // не совпала с текстом Apple — там между словами стоит «beta».
  const очередь = /another build/i.test(String(ошибка.message ?? ошибка));
  console.log(`сборка ${номер}: бета-проверка не отправлена — ${ошибка.message ?? ошибка}`);
  process.exit(очередь ? 2 : 1);
}
