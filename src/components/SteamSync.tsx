'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { getProfile } from '@/lib/db'
import { syncSteamPlaytime, importSteamLibrary } from '@/lib/steam'
import { useToast } from './Toast'

const LAST_KEY = 'hobbylog-steam-last-sync'
const AUTO_INTERVAL = 6 * 60 * 60 * 1000 // don't auto-sync more than every 6h

type Prefs = { sync: boolean; import: boolean }

// Games-only. Honors the user's Steam prefs (set on the Import page): sync
// playtimes, auto-import new purchases, both, or neither. The button does an
// explicit run; on mount it also runs the enabled actions quietly (throttled).
export default function SteamSync({ accent, onSynced }: { accent: string; onSynced: () => void }) {
  const router = useRouter()
  const [steamId, setSteamId] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<Prefs>({ sync: true, import: false })
  const [busy, setBusy] = useState(false)
  const { toast, error: toastError, success } = useToast()
  const autoRan = useRef(false)

  useEffect(() => {
    getProfile().then((p) => {
      setSteamId(p.steam_id)
      const pr: Prefs = { sync: p.steam_sync_playtime, import: p.steam_auto_import }
      setPrefs(pr)
      if (p.steam_id && !autoRan.current && (pr.sync || pr.import)) {
        autoRan.current = true
        const last = Number(localStorage.getItem(LAST_KEY) || 0)
        if (Date.now() - last > AUTO_INTERVAL) run(p.steam_id, pr, true)
      }
    }).catch(() => { /* not linked / offline */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function run(id: string, pr: Prefs, quiet: boolean) {
    // Nothing enabled: point the user at where to choose their Steam options.
    if (!pr.sync && !pr.import) {
      if (!quiet) { toast('Pick your Steam sync options first'); router.push('/import') }
      return
    }
    setBusy(true)
    try {
      const updated = pr.sync ? await syncSteamPlaytime(id) : 0
      const imported = pr.import ? await importSteamLibrary(id) : 0
      localStorage.setItem(LAST_KEY, String(Date.now()))
      const parts: string[] = []
      if (imported) parts.push(`${imported} new game${imported === 1 ? '' : 's'}`)
      if (updated) parts.push(`${updated} playtime update${updated === 1 ? '' : 's'}`)
      if (parts.length) { onSynced(); if (!quiet || imported) success(`Steam: ${parts.join(' + ')}`) }
      else if (!quiet) toast('Steam is already up to date')
    } catch (e) {
      if (!quiet) toastError((e as Error).message)
    }
    setBusy(false)
  }

  if (!steamId) return null
  const label = prefs.sync && prefs.import ? 'SYNC + IMPORT'
    : prefs.import ? 'IMPORT NEW'
    : prefs.sync ? 'SYNC PLAYTIME'
    : 'STEAM OPTIONS'
  const title = prefs.sync && prefs.import ? 'Update playtimes and import newly purchased games'
    : prefs.import ? 'Import newly purchased Steam games'
    : prefs.sync ? 'Update playtimes on games you already track'
    : 'Choose your Steam sync options'
  return (
    <button onClick={() => run(steamId, prefs, false)} disabled={busy} title={title}
      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: 'transparent', border: `1px solid ${accent}66`, borderLeft: `3px solid ${accent}`, color: accent, fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', cursor: busy ? 'wait' : 'pointer' }}>
      <RefreshCw size={13} style={busy ? { animation: 'spin 0.9s linear infinite' } : undefined} /> {busy ? 'SYNCING…' : label}
    </button>
  )
}
