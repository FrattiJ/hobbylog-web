'use client'

import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { getProfile } from '@/lib/db'
import { syncSteamPlaytime, importSteamLibrary } from '@/lib/steam'
import { useToast } from './Toast'

const LAST_KEY = 'hobbylog-steam-last-sync'
const AUTO_INTERVAL = 6 * 60 * 60 * 1000 // don't auto-sync more than every 6h

// Games-only. On mount it quietly refreshes Steam playtimes (throttled), and the
// button does an explicit sync that also pulls in newly purchased games. Only
// renders once we know a Steam account is linked.
export default function SteamSync({ accent, onSynced }: { accent: string; onSynced: () => void }) {
  const [steamId, setSteamId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { toast, error: toastError, success } = useToast()
  const autoRan = useRef(false)

  useEffect(() => {
    getProfile().then((p) => {
      setSteamId(p.steam_id)
      if (p.steam_id && !autoRan.current) {
        autoRan.current = true
        const last = Number(localStorage.getItem(LAST_KEY) || 0)
        // Quiet, playtime-only auto-refresh — never auto-imports a whole library.
        if (Date.now() - last > AUTO_INTERVAL) run(p.steam_id, { withImport: false, quiet: true })
      }
    }).catch(() => { /* not linked / offline */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function run(id: string, opts: { withImport: boolean; quiet: boolean }) {
    setBusy(true)
    try {
      const updated = await syncSteamPlaytime(id)
      const imported = opts.withImport ? await importSteamLibrary(id) : 0
      localStorage.setItem(LAST_KEY, String(Date.now()))
      const parts: string[] = []
      if (imported) parts.push(`${imported} new game${imported === 1 ? '' : 's'}`)
      if (updated) parts.push(`${updated} playtime update${updated === 1 ? '' : 's'}`)
      if (parts.length) { onSynced(); if (!opts.quiet || imported) success(`Steam: ${parts.join(' + ')}`) }
      else if (!opts.quiet) toast('Steam is already up to date')
    } catch (e) {
      if (!opts.quiet) toastError((e as Error).message)
    }
    setBusy(false)
  }

  if (!steamId) return null
  return (
    <button onClick={() => run(steamId, { withImport: true, quiet: false })} disabled={busy}
      title="Pull the latest playtimes and any newly purchased games from Steam"
      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: 'transparent', border: `1px solid ${accent}66`, borderLeft: `3px solid ${accent}`, color: accent, fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', cursor: busy ? 'wait' : 'pointer' }}>
      <RefreshCw size={13} style={busy ? { animation: 'spin 0.9s linear infinite' } : undefined} /> {busy ? 'SYNCING…' : 'SYNC STEAM'}
    </button>
  )
}
