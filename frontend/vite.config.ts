import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'

function buildVersion(): string {
  try {
    const count = execSync('git rev-list --count HEAD', { encoding: 'utf-8' }).trim();
    const hash  = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    return `1.0.${count}-${hash}`;
  } catch {
    return '1.0.0-unknown';
  }
}

const APP_VERSION = buildVersion();

export default defineConfig({
  plugins: [tailwindcss(), react()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
