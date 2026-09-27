// Builds the extension into dist/ (and optionally a zip for the Chrome Web Store).
//   node build.mjs          production build; needs SUPABASE_URL, SUPABASE_ANON_KEY, APP_URL
//   node build.mjs --dev    development build against local Supabase (reads ../web/.env.local)
//   node build.mjs --zip    production build + shravanam-smriti-extension-<version>.zip
import { build } from 'esbuild'
import { zipSync } from 'fflate'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const dev = process.argv.includes('--dev')
const zip = process.argv.includes('--zip')
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

function localWebEnv() {
  const file = '../web/.env.local'
  if (!existsSync(file)) return {}
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((l) => /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(l))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  )
}

const local = dev ? localWebEnv() : {}
const config = {
  supabaseUrl: (process.env.SUPABASE_URL || local.VITE_SUPABASE_URL || '').replace(/\/$/, ''),
  supabaseKey: process.env.SUPABASE_ANON_KEY || local.VITE_SUPABASE_ANON_KEY || '',
  appUrl: process.env.APP_URL || (dev ? 'http://localhost:5173/shravanam-smriti/' : ''),
  dev,
}
for (const [k, v] of Object.entries({ SUPABASE_URL: config.supabaseUrl, SUPABASE_ANON_KEY: config.supabaseKey, APP_URL: config.appUrl })) {
  if (!v) {
    console.error(`Missing ${k}. Set it in the environment${dev ? ' or run `make env` for web/.env.local' : ''}.`)
    process.exit(1)
  }
}
if (/^sb_secret_/.test(config.supabaseKey) || /service_role/.test(Buffer.from(config.supabaseKey.split('.')[1] ?? '', 'base64').toString())) {
  console.error('Refusing to build with a secret / service_role key. Use the publishable (anon) key.')
  process.exit(1)
}
if (!config.appUrl.endsWith('/')) config.appUrl += '/'

const out = 'dist'
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

const common = { bundle: true, target: 'chrome116', minify: !dev, sourcemap: dev ? 'inline' : false, define: { __CONFIG__: JSON.stringify(config) }, logLevel: 'warning' }
await build({ ...common, entryPoints: ['src/background/index.ts'], outfile: `${out}/background.js`, format: 'esm' })
await build({ ...common, entryPoints: ['src/content/index.ts'], outfile: `${out}/content.js`, format: 'iife' })
await build({ ...common, entryPoints: ['src/popup/popup.ts'], outfile: `${out}/popup.js`, format: 'esm' })
cpSync('src/popup/popup.html', `${out}/popup.html`)
cpSync('src/popup/popup.css', `${out}/popup.css`)
cpSync('icons', `${out}/icons`, { recursive: true, filter: (p) => !p.endsWith('.svg') })

const icons = { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' }
const manifest = {
  manifest_version: 3,
  name: dev ? 'Shravanam Smriti Attendance (dev)' : 'Shravanam Smriti Attendance',
  short_name: 'Shravanam Smriti',
  version: pkg.version,
  description: 'Counts who attends your Google Meet sessions and saves it to your Shravanam Smriti dashboard.',
  minimum_chrome_version: '116',
  icons,
  action: { default_popup: 'popup.html', default_icon: icons, default_title: 'Shravanam Smriti attendance' },
  background: { service_worker: 'background.js', type: 'module' },
  content_scripts: [{ matches: ['https://meet.google.com/*'], js: ['content.js'], run_at: 'document_idle' }],
  permissions: ['storage', 'alarms', 'identity', 'notifications'],
  host_permissions: ['https://meet.google.com/*', `${new URL(config.supabaseUrl).origin}/*`],
}
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2))

if (zip) {
  const files = {}
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) walk(p)
      else files[relative(out, p).replace(/\\/g, '/')] = readFileSync(p)
    }
  }
  walk(out)
  const name = `shravanam-smriti-extension-${pkg.version}.zip`
  writeFileSync(name, zipSync(files, { level: 9 }))
  console.log(`Wrote ${name}`)
}
console.log(`Built ${dev ? 'development' : 'production'} extension in ${out}/ (Supabase: ${new URL(config.supabaseUrl).host})`)
