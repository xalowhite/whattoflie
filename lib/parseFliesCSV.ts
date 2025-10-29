// lib/parseFliesCSV.ts
import Papa from 'papaparse'

export type ParsedFlyRow = {
  name: string
  category: string
  difficulty: string | null
  sizes: string[]
  target_species: string[]
  colorways: string[]
  image_url: string | null
  // raw tokens like "Material@Color@required"
  materialsRaw: string[]
}

export function parseFliesCSV(text: string): ParsedFlyRow[] {
  // Parse to arrays (no header handling here; we'll do it manually)
  const res = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
    // deliberately omit `delimiter` and `newline` to let Papa auto-detect
  })

  // Papa types say `res` is guaranteed; safely check errors
  if ((res as any).errors?.length) {
    console.warn('CSV parse errors (first):', (res as any).errors[0])
  }

  const rows = (res as any).data as string[][] || []
  if (!rows.length) return []

  const trim = (v: unknown) => String(v ?? '').trim()

  // Detect header row
  const first = rows[0].map(v => trim(v).toLowerCase())
  const hasHeader = first.includes('name') && (first.includes('category') || first.includes('materials'))

  let start = 0
  let header: string[] = []
  if (hasHeader) {
    header = first
    start = 1
  }

  const getCol = (cols: string[], key: string, idxFallback: number) => {
    if (hasHeader) {
      const idx = header.indexOf(key)
      return idx >= 0 ? trim(cols[idx]) : ''
    }
    return trim(cols[idxFallback] ?? '')
  }

  const splitList = (s: string) =>
    s ? s.split(/[;|]/).map(x => x.trim()).filter(Boolean) : []

  const out: ParsedFlyRow[] = []
  for (let i = start; i < rows.length; i++) {
    const cols = rows[i].map(trim)

    const name = getCol(cols, 'name', 0)
    if (!name) continue

    const category       = getCol(cols, 'category', 1) || 'trout'
    const difficulty     = getCol(cols, 'difficulty', 2) || null
    const sizes          = splitList(getCol(cols, 'sizes', 3))
    const target_species = splitList(getCol(cols, 'target_species', 4))
    const colorways      = splitList(getCol(cols, 'colorways', 5))
    const image_urlRaw   = getCol(cols, 'image_url', 6)
    const image_url      = image_urlRaw || null
    const materialsRaw   = splitList(getCol(cols, 'materials', 7))

    out.push({ name, category, difficulty, sizes, target_species, colorways, image_url, materialsRaw })
  }

  return out
}
