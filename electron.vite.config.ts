import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: cinelab-asset:",
  "media-src 'self' blob: cinelab-asset:",
  "font-src 'self' data:",
  "connect-src 'self' ws://localhost:* http://localhost:* cinelab-asset:"
].join('; ')

const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: cinelab-asset:",
  "media-src 'self' blob: cinelab-asset:",
  "font-src 'self' data:",
  "connect-src 'self' cinelab-asset:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "worker-src 'self' blob:"
].join('; ')

function cspPlugin(): Plugin {
  return {
    name: 'cinelab-csp',
    transformIndexHtml(html, context) {
      const csp = context.server ? DEV_CSP : PROD_CSP
      return html.replace(
        /<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*"\s*\/?>/,
        `<meta http-equiv="Content-Security-Policy" content="${csp}" />`
      )
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          'timeline-render': resolve('src/renderer/timeline-render.html'),
          'stage-render': resolve('src/renderer/stage-render.html')
        }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), tailwindcss(), cspPlugin()]
  }
})
