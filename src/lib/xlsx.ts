import { makeZip, type ZipEntry } from './zip'

// Writes a multi-sheet .xlsx by assembling the OOXML parts by hand.
//
// An xlsx is a zip holding a handful of XML files, and the subset needed for
// "several tables of plain values" is small. Strings go inline (t="inlineStr")
// rather than through a shared-string table -- slightly larger, much simpler, and
// the file is kilobytes either way.

export type CellValue = string | number | null | undefined

export interface Sheet {
  name: string
  headers: string[]
  rows: CellValue[][]
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // XML 1.0 forbids most control characters outright. Notes pasted from
    // elsewhere can carry them, and one stray byte makes Excel call the whole
    // workbook corrupt, so drop them rather than emit an unopenable file.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

// 0 -> A, 25 -> Z, 26 -> AA. Sheets here are narrow, but a hobby with many
// columns shouldn't silently produce a broken reference.
function colName(index: number): string {
  let n = index
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

function cell(ref: string, value: CellValue): string {
  if (value == null || value === '') return ''
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(String(value))}</t></is></c>`
}

function sheetXml(sheet: Sheet): string {
  const lines: string[] = []
  const all: CellValue[][] = [sheet.headers, ...sheet.rows]
  all.forEach((row, r) => {
    const cells = row.map((v, c) => cell(`${colName(c)}${r + 1}`, v)).join('')
    lines.push(`<row r="${r + 1}">${cells}</row>`)
  })
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetData>${lines.join('')}</sheetData>`
    + `</worksheet>`
}

// Excel's rules: 31 characters max, none of []:*?/\, non-empty, and unique
// within the workbook. A rejected name makes the file refuse to open, so this
// is enforced here rather than trusted to callers.
function sheetNames(sheets: Sheet[]): string[] {
  const used = new Set<string>()
  return sheets.map((s, i) => {
    const base = (s.name.replace(/[[\]:*?/\\]/g, ' ').trim() || `Sheet${i + 1}`).slice(0, 31)
    let name = base
    let n = 2
    while (used.has(name.toLowerCase())) {
      const suffix = ` ${n++}`
      name = base.slice(0, 31 - suffix.length) + suffix
    }
    used.add(name.toLowerCase())
    return name
  })
}

export function makeXlsx(sheets: Sheet[]): Blob {
  if (sheets.length === 0) throw new Error('An export needs at least one sheet')
  const names = sheetNames(sheets)

  const entries: ZipEntry[] = [
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
        + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
        + `<Default Extension="xml" ContentType="application/xml"/>`
        + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
        + sheets.map((_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
        + `</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
        + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
        + `</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"`
        + ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
        + `<sheets>`
        + names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
        + `</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
        + sheets.map((_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
        + `</Relationships>`,
    },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, content: sheetXml(s) })),
  ]

  const zip = makeZip(entries)
  return new Blob([zip], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// -- CSV ---------------------------------------------------------------------

// RFC 4180: quote anything containing a comma, quote or newline, and double up
// embedded quotes. A leading BOM so Excel reads UTF-8 rather than guessing the
// system codepage and mangling accented titles.
export function toCsv(sheet: Sheet, withBom = true): string {
  const field = (v: CellValue): string => {
    if (v == null) return ''
    const s = String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [sheet.headers.map(field).join(',')]
  for (const row of sheet.rows) lines.push(row.map(field).join(','))
  return (withBom ? '﻿' : '') + lines.join('\r\n')
}
