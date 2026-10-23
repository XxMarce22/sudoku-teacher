import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Sudoku100 does not send CORS headers, so browsers can only reach it through
// a same-origin proxy. This config exposes one at /puzzle-api/sudoku100 during
// `npm run dev` and `npm run preview`. Sugoku and Dosuku are CORS-enabled and
// are called directly as fallbacks, so the app still works (with lower-quality
// puzzles) on a plain static deployment.
const sudoku100 = {
  target: 'https://www.sudoku100.com',
  changeOrigin: true,
  rewrite: (path: string) => path.replace(/^\/puzzle-api\/sudoku100/, ''),
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/puzzle-api/sudoku100': sudoku100 },
  },
  preview: {
    proxy: { '/puzzle-api/sudoku100': sudoku100 },
  },
})
