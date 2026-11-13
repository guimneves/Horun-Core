import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // @horun/design-system é um pacote irmão referenciado por "file:" — sem
  // preserveSymlinks, o Vite resolveria "react"/"framer-motion" a partir
  // do caminho real do pacote (sem node_modules próprio) em vez do
  // node_modules deste app, e o build falharia.
  resolve: {
    preserveSymlinks: true,
  },
  server: {
    port: 5173,
    // desenvolvimento: a API do backend local (uvicorn na 8000)
    proxy: { '/api': process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000' },
  },
})
