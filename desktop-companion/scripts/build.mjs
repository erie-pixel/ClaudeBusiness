import { build } from 'esbuild'
import { mkdirSync, copyFileSync } from 'node:fs'

await build({
  entryPoints: ['electron/main.ts', 'electron/preload.ts'],
  outdir: 'dist/main',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron', 'ws'],
})

await build({
  entryPoints: ['src/renderer.ts'],
  outdir: 'dist/renderer',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'chrome120',
})

mkdirSync('dist/renderer', { recursive: true })
copyFileSync('src/index.html', 'dist/renderer/index.html')
console.log('build ok')
