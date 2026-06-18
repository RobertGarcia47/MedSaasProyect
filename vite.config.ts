import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
  },
  server: {
    headers: {
      // Necesario para el popup de Google OAuth (signInWithPopup / OAuth).
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
})
