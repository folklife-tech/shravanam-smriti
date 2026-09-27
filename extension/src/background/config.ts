// Filled in at build time (build.mjs) from the same public values the web
// app uses. The Supabase publishable key is public by design; row-level
// security in the database protects the data.
declare const __CONFIG__: {
  supabaseUrl: string
  supabaseKey: string
  appUrl: string
  dev: boolean
}

export const CONFIG = __CONFIG__
