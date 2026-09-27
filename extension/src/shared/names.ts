// Mirrors public.name_key() in the database and web/src/lib/nameKey.ts.
export function nameKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

const SUFFIXES = [
  /\s*\((you|me|host|meeting host|co-host|presentation|presenting)\)\s*$/i,
  /\s*\((vous|du|tú|tu|आप)\)\s*$/i, // "(You)" in a few other UI languages
]

/**
 * Tidy a name read from the Meet page. Returns null for entries that aren't
 * people (screen presentations, placeholders, empty strings).
 */
export function cleanName(raw: string | null | undefined): string | null {
  if (!raw) return null
  // eslint-disable-next-line no-control-regex -- strip control characters
  let n = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  for (let i = 0; i < 2; i++) for (const re of SUFFIXES) n = n.replace(re, '').trim()
  if (!n || n.length > 200) return null
  if (/^(you|presentation)$/i.test(n) || /\bpresent(ation|ing)\b/i.test(n)) return null
  return n
}
