/**
 * attach-testflight — положить свежую сборку в TestFlight.
 *
 * ── Зачем ─────────────────────────────────────────────────────────────
 *
 * Выгруженная сборка сама по себе НЕ попадает к тестировщикам: её нужно
 * привязать к группе. Пока группы не было, выгруженное просто лежало в App
 * Store Connect, и владелец не мог поставить его на телефон — это выяснилось
 * 06.09.2026, когда он попросил выкладывать и в TestFlight тоже.
 *
 * Скрипт находит последнюю обработанную сборку и привязывает её к группе.
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
// Внутренняя группа предпочтительнее: ей не нужен отдельный Beta App Review.
const группа = группы.data.find(g => g.attributes.isInternalGroup) ?? группы.data[0];

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
const свежая = нужный
  ? готовые.find(b => b.attributes.version === String(нужный))
  : готовые.reduce((a, b) =>
    Number(b.attributes.version) > Number(a.attributes.version) ? b : a);

if (!свежая) {
  console.error(`Сборки ${нужный} среди обработанных нет — класть в TestFlight нечего.`);
  process.exit(1);
}

const вГруппе = await ascGet(`/v1/betaGroups/${группа.id}/builds`, credentials, { limit: 50 });
if (вГруппе.data.some(b => b.id === свежая.id)) {
  console.log(`Сборка ${свежая.attributes.version} уже в группе «${группа.attributes.name}».`);
  process.exit(0);
}

await ascSend('POST', `/v1/betaGroups/${группа.id}/relationships/builds`,
  { data: [{ type: 'builds', id: свежая.id }] }, credentials);

console.log(`Сборка ${свежая.attributes.version} добавлена в группу «${группа.attributes.name}» — TestFlight обновится.`);
