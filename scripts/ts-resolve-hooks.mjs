/**
 * Хук разрешения модулей — исполняется в отдельном потоке загрузчика,
 * поэтому лежит отдельным файлом от точки регистрации.
 * См. scripts/ts-resolve.mjs.
 */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) throw err;
    for (const suffix of ['.ts', '.tsx', '/index.ts']) {
      try {
        return await next(specifier + suffix, context);
      } catch { /* пробуем следующий вариант */ }
    }
    throw err;
  }
}
