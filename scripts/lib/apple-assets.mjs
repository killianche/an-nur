/**
 * Чтение plist и размеров изображений без macOS.
 *
 * Зачем. Предполётная проверка релиза (scripts/check-ios-release.mjs) звала
 * `plutil` и `sips` — оба существуют только в macOS. Из-за этого гард, который
 * должен ловить ошибки ДО отправки в App Store, вообще не запускался нигде,
 * кроме Mac владельца: ни в этой рабочей среде, ни на сервере, ни в CI.
 * А проверять он должен ровно то, что дешевле поймать заранее — забытый
 * номер сборки, рассинхрон веб-ассетов, альфа-канал в иконке App Store
 * (за неё Apple отклоняет загрузку).
 *
 * Здесь ровно столько разбора, сколько нужно этим проверкам, и ни строкой
 * больше: полноценный парсер plist и декодер изображений в проект не нужны.
 */

/**
 * Значение ключа из XML-plist.
 *
 * Info.plist у Capacitor — всегда XML (не бинарный), поэтому обходимся без
 * декодера bplist. Ищем `<key>ИМЯ</key>` и разбираем следующий за ним
 * элемент. Поддержаны типы, которые реально встречаются в наших проверках:
 * строка, булево, целое, массив строк.
 *
 * Возвращает `undefined`, если ключа нет — вызывающий отличит «нет ключа» от
 * «ключ равен false».
 */
export function plistValue(xml, key) {
  const keyTag = `<key>${key}</key>`;
  const at = xml.indexOf(keyTag);
  if (at === -1) return undefined;

  const rest = xml.slice(at + keyTag.length);
  const m = rest.match(/^\s*<(\w+)(\s*\/)?>/);
  if (!m) return undefined;
  const [, tag, selfClosing] = m;

  if (tag === 'true') return true;
  if (tag === 'false') return false;
  if (selfClosing) return tag === 'array' ? [] : undefined;

  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = rest.indexOf(open) + open.length;
  const end = rest.indexOf(close, start);
  if (end === -1) return undefined;
  const body = rest.slice(start, end);

  if (tag === 'string') return decodeEntities(body);
  if (tag === 'integer') return Number(body.trim());
  if (tag === 'real') return Number(body.trim());
  if (tag === 'array') {
    return [...body.matchAll(/<string>([\s\S]*?)<\/string>/g)]
      .map(x => decodeEntities(x[1]));
  }
  return undefined;
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Ширина, высота и наличие альфа-канала у PNG или JPEG.
 *
 * Читаем заголовки, а не декодируем пиксели: для проверки «1024×1024 без
 * альфы» этого достаточно, и не нужна ни одна зависимость.
 *
 * Возвращает `{ width, height, hasAlpha }` либо `null`, если формат не
 * распознан — вызывающий обязан считать это провалом проверки, а не успехом.
 */
export function imageInfo(buffer) {
  if (isPng(buffer)) return pngInfo(buffer);
  if (isJpeg(buffer)) return jpegInfo(buffer);
  return null;
}

function isPng(b) {
  return b.length > 24
    && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;
}

function pngInfo(b) {
  // IHDR обязан идти первым чанком: длина(4) + тип(4), дальше данные.
  if (b.toString('latin1', 12, 16) !== 'IHDR') return null;
  const width = b.readUInt32BE(16);
  const height = b.readUInt32BE(20);
  const colourType = b[25];

  // Типы 4 (серый + альфа) и 6 (RGBA) несут альфа-канал по определению.
  let hasAlpha = colourType === 4 || colourType === 6;

  // Палитра и RGB могут получить прозрачность отдельным чанком tRNS —
  // Apple отклоняет иконку и в этом случае, поэтому ищем его тоже.
  if (!hasAlpha) hasAlpha = hasChunk(b, 'tRNS');
  return { width, height, hasAlpha };
}

function hasChunk(b, name) {
  let at = 8;
  while (at + 8 <= b.length) {
    const length = b.readUInt32BE(at);
    const type = b.toString('latin1', at + 4, at + 8);
    if (type === name) return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    at += 12 + length;   // длина + тип + данные + CRC
  }
  return false;
}

function isJpeg(b) {
  return b.length > 4 && b[0] === 0xff && b[1] === 0xd8;
}

function jpegInfo(b) {
  // Идём по маркерам до любого SOF, кроме таблиц: в нём лежат размеры.
  let at = 2;
  while (at + 9 < b.length) {
    if (b[at] !== 0xff) { at++; continue; }
    const marker = b[at + 1];
    // SOF0..SOF15, кроме DHT (c4), JPG (c8) и DAC (cc) — они не про кадр.
    if (marker >= 0xc0 && marker <= 0xcf
        && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: b.readUInt16BE(at + 5),
        width: b.readUInt16BE(at + 7),
        // В JPEG альфа-канала не бывает — формат её не поддерживает.
        hasAlpha: false,
      };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    const length = b.readUInt16BE(at + 2);
    at += 2 + length;
  }
  return null;
}
