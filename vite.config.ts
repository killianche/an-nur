import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Версия берётся из package.json на этапе сборки: держать её второй
// копией в коде — верный способ однажды показать в «Аккаунте» не то,
// что стоит в пакете.
const pkgVersion = JSON.parse(readFileSync('./package.json', 'utf8')).version as string;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkgVersion) },
  plugins: [react(), tailwindcss()],
  // 5174, чтобы дев-сервер QuranRu не конфликтовал с оригинальным
  // QuranIng на 5173, когда оба открыты одновременно.
  server: { port: 5174, strictPort: true },
})
