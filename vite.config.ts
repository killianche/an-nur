import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 5174, чтобы дев-сервер QuranRu не конфликтовал с оригинальным
  // QuranIng на 5173, когда оба открыты одновременно.
  server: { port: 5174, strictPort: true },
})
