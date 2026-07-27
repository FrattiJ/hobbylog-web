'use client'

import { useEffect, useRef, useState } from 'react'
import { Undo2, Redo2, Bold, Italic, Underline, List } from 'lucide-react'
import { getNotes, saveNotes } from '@/lib/db'

const ACCENT = '#d97706'

const FONT_SIZES = [
  { label: 'SMALL',  value: '2' },
  { label: 'NORMAL', value: '3' },
  { label: 'LARGE',  value: '5' },
  { label: 'HUGE',   value: '6' },
]

function ToolButton({ onExec, title, children }: { onExec: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      title={title}
      // mousedown + preventDefault keeps focus and selection inside the editor
      onMouseDown={(e) => { e.preventDefault(); onExec() }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 30,
        background: 'transparent',
        border: '1px solid var(--border-dim)',
        color: 'var(--text-dim)',
        cursor: 'pointer',
        transition: 'all 0.12s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = ACCENT; e.currentTarget.style.borderColor = ACCENT }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.borderColor = 'var(--border-dim)' }}
    >
      {children}
    </button>
  )
}

export default function NotesPage() {
  const editorRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Load once into the uncontrolled editor so re-renders never move the caret
  useEffect(() => {
    getNotes().then((content) => {
      if (editorRef.current) editorRef.current.innerHTML = content
      setLoaded(true)
    })
  }, [])

  function flush() {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    if (editorRef.current) {
      saveNotes(editorRef.current.innerHTML).then(() => setDirty(false))
    }
  }

  function scheduleSave() {
    setDirty(true)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flush, 500)
  }

  // Save any pending edits when navigating away
  useEffect(() => {
    const editor = editorRef.current // stable for the lifetime of the page
    return () => {
      if (saveTimer.current && editor) {
        clearTimeout(saveTimer.current)
        saveNotes(editor.innerHTML)
      }
    }
  }, [])

  function exec(command: string, value?: string) {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    scheduleSave()
  }

  return (
    <div style={{ padding: 32, maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 4 }}>
          SYSTEM / FIELD NOTES
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: 0 }}>
            NOTES
          </h1>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: dirty ? ACCENT : '#22c55e', letterSpacing: '0.14em' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: dirty ? ACCENT : '#22c55e' }} />
            {dirty ? 'WRITING…' : 'SAVED'}
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px',
        background: 'var(--bg-card)', border: '1px solid var(--border-dim)',
        borderTop: `2px solid ${ACCENT}`, marginBottom: 0, flexWrap: 'wrap',
      }}>
        <ToolButton title="Undo (Ctrl+Z)" onExec={() => exec('undo')}><Undo2 size={14} /></ToolButton>
        <ToolButton title="Redo (Ctrl+Y)" onExec={() => exec('redo')}><Redo2 size={14} /></ToolButton>
        <span style={{ width: 1, height: 20, background: 'var(--border-dim)', margin: '0 4px' }} />
        <ToolButton title="Bold (Ctrl+B)" onExec={() => exec('bold')}><Bold size={14} /></ToolButton>
        <ToolButton title="Italic (Ctrl+I)" onExec={() => exec('italic')}><Italic size={14} /></ToolButton>
        <ToolButton title="Underline (Ctrl+U)" onExec={() => exec('underline')}><Underline size={14} /></ToolButton>
        <span style={{ width: 1, height: 20, background: 'var(--border-dim)', margin: '0 4px' }} />
        <ToolButton title="Bullet list" onExec={() => exec('insertUnorderedList')}><List size={14} /></ToolButton>
        <select
          title="Font size"
          defaultValue="3"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => exec('fontSize', e.target.value)}
          style={{
            height: 30, padding: '0 8px',
            background: 'var(--bg-base)', border: '1px solid var(--border-dim)',
            color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 11,
            letterSpacing: '0.1em', cursor: 'pointer', outline: 'none',
          }}
        >
          {FONT_SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable={loaded}
        suppressContentEditableWarning
        onInput={scheduleSave}
        onBlur={flush}
        style={{
          flex: 1,
          minHeight: 480,
          padding: '20px 24px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-dim)',
          borderTop: 'none',
          color: 'var(--text-hi)',
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
          lineHeight: 1.8,
          letterSpacing: '0.02em',
          outline: 'none',
          overflowY: 'auto',
          cursor: 'text',
          marginBottom: 32,
        }}
      />
    </div>
  )
}
