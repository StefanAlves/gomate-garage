import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import pandacss from '@pandacss/vite'
import { nitro } from 'nitro/vite'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tanstackStart({ importProtection: { behavior: 'error' } }),
    // Vercel sets VERCEL=1 while building there; locally `npm start` runs the
    // plain Node server. Both are Node runtimes (the libSQL client needs one).
    nitro({ preset: process.env.VERCEL ? 'vercel' : 'node-server' }),
    // Must run before the React plugin. Injects Panda's generated CSS into
    // src/styles.css (the file with the @layer declaration) and keeps
    // styled-system/ codegen in sync while developing.
    pandacss(),
    viteReact(),
  ],
})
