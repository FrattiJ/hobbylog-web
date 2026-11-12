'use client'

import { useState } from 'react'
import { Upload, Check } from 'lucide-react'
import { HOBBIES } from '@/lib/hobbies'
import { HOBBY_ICON_MAP } from './hobbyIcons'
import { useHobbies } from './HobbyContext'
import type { HobbyCategory } from '@/types/database'

const ACCENT = '#0891b2'

type Format = 'xlsx' | 'csv'

export default function ExportPanel() {
  const { enabledIds } = useHobbies()
  // Default to what you actually track; everything else is still selectable in
  // case you turned a hobby off but kept its entries.
  const [picked, setPicked] = useState<HobbyCategory[]>(enabledIds)
  const [format, setFormat] = useState<Format>('xlsx')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const toggle = (id: HobbyCategory) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  async function run() {
    if (picked.length === 0) { setMsg('Pick at least one hobby to export.'); return }
    setBusy(true)
    setMsg(null)
    try {
      // Loaded on demand: the writers are dead weight in the bundle for everyone
      // who never exports, which is nearly everyone.
      const [{ collectSheets, download, fileStamp }, { makeXlsx, toCsv }, { makeZip }] = await Promise.all([
        import('@/lib/exportData'),
        import('@/lib/xlsx'),
        import('@/lib/zip'),
      ])

      // HOBBIES order, not click order, so two exports of the same selection
      // produce the same workbook.
      const ordered = HOBBIES.map((h) => h.id).filter((id) => picked.includes(id))
      const sheets = await collectSheets(ordered)
      if (sheets.length === 0) {
        setMsg('Nothing to export yet — those hobbies have no entries.')
        setBusy(false)
        return
      }

      const stamp = fileStamp()
      if (format === 'xlsx') {
        download(makeXlsx(sheets), `hobbylog-${stamp}.xlsx`)
      } else if (sheets.length === 1) {
        const blob = new Blob([toCsv(sheets[0])], { type: 'text/csv;charset=utf-8' })
        download(blob, `hobbylog-${slug(sheets[0].name)}-${stamp}.csv`)
      } else {
        // One CSV can only hold one table, and browsers won't reliably fire a
        // burst of downloads, so several tables ship as a zip of CSVs.
        const zip = makeZip(uniqueNames(sheets.map((s) => slug(s.name))).map((name, i) => ({
          name: `${name}.csv`,
          content: toCsv(sheets[i]),
        })))
        download(zip, `hobbylog-${stamp}.zip`)
      }

      const tables = sheets.length === 1 ? '1 table' : `${sheets.length} tables`
      const rows = sheets.reduce((n, s) => n + s.rows.length, 0)
      setMsg(`Exported ${tables}, ${rows.toLocaleString()} rows.`)
    } catch (e) {
      setMsg(e instanceof Error ? `Export failed: ${e.message}` : 'Export failed — please try again.')
    } finally {
      setBusy(false)
    }
  }

  const card: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border-dim)',
    borderLeft: `3px solid ${ACCENT}`, padding: 20, marginBottom: 16,
  }
  const h2: React.CSSProperties = {
    fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
    color: 'var(--text-hi)', letterSpacing: '0.05em', margin: '0 0 12px',
  }
  const note: React.CSSProperties = {
    fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)',
    margin: '0 0 12px', lineHeight: 1.5,
  }

  return (
    <div style={card}>
      <h2 style={{ ...h2, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Upload size={15} style={{ color: ACCENT }} /> Export Your Data
      </h2>
      <p style={note}>
        Your library as a spreadsheet — every entry, session log, workout, set and
        record. It&apos;s yours; take it wherever you like.
      </p>

      <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em', margin: '0 0 6px' }}>
        What to Include
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 16 }}>
        {HOBBIES.map((h) => {
          const Icon = HOBBY_ICON_MAP[h.icon]
          const on = picked.includes(h.id)
          return (
            <button
              key={h.id} onClick={() => toggle(h.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                background: on ? `${h.accent}18` : 'transparent',
                border: `1px solid ${on ? h.accent : 'var(--border-dim)'}`,
                borderLeft: on ? `3px solid ${h.accent}` : '1px solid var(--border-dim)',
                color: on ? h.accent : 'var(--text-dim)', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.02em',
                textAlign: 'left',
              }}
            >
              {Icon && <Icon size={14} />}
              <span style={{ flex: 1 }}>{h.pluralLabel}</span>
              {on && <Check size={13} />}
            </button>
          )
        })}
      </div>

      <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em', margin: '0 0 6px' }}>
        Format
      </p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {([
          ['xlsx', 'Excel (.xlsx)'],
          ['csv', 'CSV'],
        ] as const).map(([id, label]) => (
          <button
            key={id} onClick={() => setFormat(id)}
            style={{
              padding: '6px 14px', fontFamily: 'var(--font-body)', fontSize: 12,
              letterSpacing: '0.05em',
              background: format === id ? `${ACCENT}22` : 'transparent',
              border: `1px solid ${format === id ? ACCENT : 'var(--border-dim)'}`,
              color: format === id ? ACCENT : 'var(--text-dim)', cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p style={note}>
        {format === 'xlsx'
          ? 'One workbook, one sheet per hobby — plus separate sheets for session logs, workouts, sets and records.'
          : 'One CSV per table. Pick more than one and they arrive together in a .zip, since a CSV only holds a single table.'}
      </p>

      <button
        onClick={run} disabled={busy || picked.length === 0}
        style={{
          padding: '9px 18px', fontFamily: 'var(--font-body)', fontSize: 12,
          fontWeight: 700, letterSpacing: '0.05em', color: ACCENT,
          background: `${ACCENT}22`, border: `1px solid ${ACCENT}`, borderLeft: `3px solid ${ACCENT}`,
          cursor: busy ? 'wait' : 'pointer', opacity: busy || picked.length === 0 ? 0.5 : 1,
        }}
      >
        {busy ? 'Building…' : 'Export'}
      </button>

      {msg && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-mid)', margin: '12px 0 0' }}>
          {msg}
        </p>
      )}
    </div>
  )
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'data'
}

// Two sheet names can slug down to the same filename. Today none of them do,
// but a zip with duplicate entries is one unzippers reject outright, so don't
// leave it resting on that.
function uniqueNames(names: string[]): string[] {
  const used = new Set<string>()
  return names.map((name) => {
    let out = name
    let n = 2
    while (used.has(out)) out = `${name}-${n++}`
    used.add(out)
    return out
  })
}
