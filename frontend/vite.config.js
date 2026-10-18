import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Must match FRONTEND_URL allowed by backend CORS
  server: { port: 5173, strictPort: true },
})
