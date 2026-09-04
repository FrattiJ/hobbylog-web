// A minimal ZIP writer.
//
// Two things here need a zip: a multi-hobby CSV export (one file per hobby) and
// the .xlsx export, since an xlsx *is* a zip of XML parts. Rather than pull in a
// library for it -- SheetJS's npm build carries unfixed advisories and ExcelJS is
// about a megabyte -- this writes the archive directly. It's a well-specified
// format and we only need the simplest case.
//
// Entries are stored, not deflated. Compression would mean shipping an inflate
// implementation for a payload measured in kilobytes; every unzipper, Excel
// included, reads stored entries.

// Standard CRC-32 (IEEE 802.3), the checksum the zip central directory wants.
// The table is built once on first use rather than sitting in the bundle.
let crcTable: Uint32Array | null = null

function crc32Table(): Uint32Array {
  if (crcTable) return crcTable
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  crcTable = table
  return table
}

function crc32(bytes: Uint8Array): number {
  const table = crc32Table()
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  /** Path inside the archive, e.g. "xl/worksheets/sheet1.xml". */
  name: string
  content: string
}

// Zip stores the timestamp as MS-DOS date/time: a 16-bit date (year since 1980,
// month, day) and a 16-bit time with two-second resolution.
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear())
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

export function makeZip(entries: ZipEntry[], now = new Date()): Blob {
  const encoder = new TextEncoder()
  const { time, date } = dosDateTime(now)

  const locals: Uint8Array<ArrayBufferLike>[] = []
  const centrals: Uint8Array<ArrayBufferLike>[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const data = encoder.encode(entry.content)
    const crc = crc32(data)

    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)   // local file header signature
    lv.setUint16(4, 20, true)           // version needed to extract (2.0)
    lv.setUint16(6, 0x0800, true)       // flags: filename is UTF-8
    lv.setUint16(8, 0, true)            // method: stored
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true) // compressed size == uncompressed
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)           // extra field length
    local.set(nameBytes, 30)

    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)   // central directory header signature
    cv.setUint16(4, 20, true)           // version made by
    cv.setUint16(6, 20, true)           // version needed
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true)           // extra
    cv.setUint16(32, 0, true)           // comment
    cv.setUint16(34, 0, true)           // disk number start
    cv.setUint16(36, 0, true)           // internal attributes
    cv.setUint32(38, 0, true)           // external attributes
    cv.setUint32(42, offset, true)      // offset of this entry's local header
    central.set(nameBytes, 46)

    locals.push(local, data)
    centrals.push(central)
    offset += local.length + data.length
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0)

  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)     // end of central directory signature
  ev.setUint16(4, 0, true)              // this disk
  ev.setUint16(6, 0, true)              // disk with central directory
  ev.setUint16(8, entries.length, true) // entries on this disk
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)        // central directory starts after the data
  ev.setUint16(20, 0, true)             // comment length

  // Concatenated into one buffer rather than handed to Blob as a list of parts:
  // TextEncoder yields Uint8Array<ArrayBufferLike>, which the DOM types no longer
  // accept as a BlobPart, and one allocation is cheaper than hundreds anyway.
  const parts = [...locals, ...centrals, end]
  const total = parts.reduce((n, part) => n + part.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) { out.set(part, at); at += part.length }

  return new Blob([out], { type: 'application/zip' })
}
