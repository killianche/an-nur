/**
 * Статический preflight первого App Store-релиза.
 *
 * Не заменяет подпись и проверку App Store Connect: он ловит локальные
 * расхождения, из-за которых архив заведомо нельзя отправлять — неверный
 * Bundle ID, версия, пропущенный privacy manifest, прозрачная иконка,
 * старые ссылки PWA и несинхронная production-сборка.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const root = process.cwd();
const checks = [];

function add(name, pass, detail = '') {
  checks.push({ name, pass, detail });
}

function text(path) {
  return readFileSync(join(root, path), 'utf8');
}

function sha(path) {
  return createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
}

function command(...args) {
  return execFileSync(args[0], args.slice(1), { cwd: root, encoding: 'utf8' }).trim();
}

const plist = command('plutil', '-convert', 'json', '-o', '-', 'ios/App/App/Info.plist');
const info = JSON.parse(plist);
const pkg = JSON.parse(text('package.json'));
const project = text('ios/App/App.xcodeproj/project.pbxproj');
const privacy = text('ios/App/App/PrivacyInfo.xcprivacy');
const manifest = JSON.parse(text('public/manifest.webmanifest'));

add('Bundle ID', /PRODUCT_BUNDLE_IDENTIFIER = ru\.annur\.quran;/.test(project));
// Версию и номер сборки держим в package.json — единственном месте, где их
// правят. Раньше ожидаемые числа были зашиты прямо здесь, и подъём версии
// ронял собственный preflight: гард сообщал не «забыли поднять», а «забыли
// поднять В ДВУХ местах».
const expectedVersion = pkg.version.replace(/\.0$/, '');
const expectedBuild = String(pkg.iosBuild);
add(
  `Версия ${expectedVersion}`,
  new RegExp(`MARKETING_VERSION = ${expectedVersion.replace(/\./g, '\\.')};`).test(project),
);
add(
  `Build ${expectedBuild}`,
  new RegExp(`CURRENT_PROJECT_VERSION = ${expectedBuild};`).test(project),
);
add('Русская локализация', info.CFBundleDevelopmentRegion === 'ru');
add('Описание геолокации', typeof info.NSLocationWhenInUseUsageDescription === 'string');
add('Фоновое аудио', info.UIBackgroundModes?.includes('audio') === true);
add('Export compliance', info.ITSAppUsesNonExemptEncryption === false);
add('Privacy manifest', privacy.includes('<key>NSPrivacyTracking</key>'));
add('Privacy manifest без сбора', /<key>NSPrivacyCollectedDataTypes<\/key>\s*<array\/>/.test(privacy));
add('App Store export options', existsSync(join(root, 'ios/ExportOptions-AppStore.plist')));

for (const size of [16, 32, 48, 72, 96, 128, 180, 192, 256, 512]) {
  add(`Web icon ${size}`, existsSync(join(root, `public/icons/icon-${size}.png`)));
}
add('PWA name an-Nur', manifest.name === 'an-Nur' && manifest.short_name === 'an-Nur');
add('PWA icon paths', manifest.icons.every(icon => icon.src.endsWith('.png')));

const iconInfo = command(
  'sips', '-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'hasAlpha',
  'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
);
add('App Store icon 1024×1024', /pixelWidth: 1024/.test(iconInfo) && /pixelHeight: 1024/.test(iconInfo));
add('App Store icon без alpha', /hasAlpha: no/.test(iconInfo));

for (const nativeIndex of [
  'ios/App/App/public/index.html',
]) {
  const pass = existsSync(join(root, 'dist/index.html'))
    && existsSync(join(root, nativeIndex))
    && sha('dist/index.html') === sha(nativeIndex);
  add(`Синхронизация ${nativeIndex}`, pass);
}

for (const [folder, width, height] of [
  ['iphone-6.9', 1320, 2868],
  ['ipad-13', 2064, 2752],
]) {
  for (const name of ['01-quran', '02-surah', '03-mushaf', '04-azkar', '05-prayer']) {
    const path = `app-store/screenshots/${folder}/${name}.jpg`;
    const present = existsSync(join(root, path));
    const imageInfo = present
      ? command('sips', '-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'hasAlpha', path)
      : '';
    add(
      `Скриншот ${folder}/${name}`,
      present
        && imageInfo.includes(`pixelWidth: ${width}`)
        && imageInfo.includes(`pixelHeight: ${height}`)
        && imageInfo.includes('hasAlpha: no'),
    );
  }
}

for (const check of checks) {
  console.log(`${check.pass ? '✓' : '✗'} ${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
}

const failed = checks.filter(check => !check.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} проверок пройдено`);
if (failed.length) process.exitCode = 1;
