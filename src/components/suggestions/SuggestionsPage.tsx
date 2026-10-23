'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Compass, CheckCheck, RefreshCw, Loader2 } from 'lucide-react'
import {
  getAllEntries, getSessionActivity, insertEntry, updateEntry,
  normalizeBacklogPriorities, ENTRIES_CHANGED_EVENT, type SessionActivity,
} from '@/lib/db'
import { backfillTaste, needsTasteEnrichment } from '@/lib/entries'
import { buildTasteProfile, entryHours, tagsOf, type TasteProfile, type TouchSource } from '@/lib/taste'
import {
  buildBrief, discoverySlots, excludeOwned, fetchCandidates, pickNextUp, scoreCandidates,
  type Candidate, type DiscoveryPick, type NextUpPick,
} from '@/lib/recommend'
import { HOBBY_MAP } from '@/lib/hobbies'
import type { Entry, HobbyCategory } from '@/types/database'
import { useHobbies } from '@/components/HobbyContext'
import { useToast } from '@/components/Toast'
import { CLIP } from '@/components/MechCard'
import { Panel, Tag, Btn, Reasons, ScoreBar, Empty, Cover } from './ui'

type Mode = 'next' | 'triage' | 'discover'

const MODES: Array<{ id: Mode; label: string; icon: typeof Sparkles; accent: string }> = [
  { id: 'next',     label: 'Next Up',       icon: Sparkles,  accent: '#7c3aed' },
  { id: 'triage',   label: 'Finish or Drop', icon: CheckCheck, accent: '#0891b2' },
  { id: 'discover', label: 'Discover',      icon: Compass,   accent: '#22c55e' },
]

const hrs = (h: number) => (h >= 10 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h`)

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

// Say where an idle date came from. An entry's own updated_at moves for reasons
// that aren't you playing it, so it gets called out as approximate instead of
// being presented with the same confidence as a real last-played timestamp.
function touchLine(source: TouchSource, iso: string): string {
  if (source === 'steam') return `Steam last saw you play it on ${fmtDate(iso)}`
  if (source === 'session') return `Last session you logged: ${fmtDate(iso)}`
  return `Approximate — last change to this entry was ${fmtDate(iso)}. Sync Steam or log a session for an exact date.`
}

export default function SuggestionsPage() {
  const router = useRouter()
  const { enabledHobbies } = useHobbies()
  const toast = useToast()

  const [entries, setEntries] = useState<Entry[]>([])
  const [activity, setActivity] = useState<SessionActivity>({ byEntry: new Map(), log: [] })
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<Mode>('next')
  const [category, setCategory] = useState<HobbyCategory | 'all'>('all')

  const [enriching, setEnriching] = useState<{ done: number; total: number } | null>(null)
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [finding, setFinding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    return Promise.all([getAllEntries(), getSessionActivity().catch(() => ({ byEntry: new Map(), log: [] }))])
      .then(([e, a]) => { setEntries(e); setActivity(a) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    const onChange = () => { load() }
    window.addEventListener(ENTRIES_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(ENTRIES_CHANGED_EVENT, onChange)
  }, [load])

  const profile: TasteProfile = useMemo(() => buildTasteProfile(entries, activity), [entries, activity])

  const entryHobbies = enabledHobbies.filter((h) => !h.customSection)
  const inScope = useCallback(
    (c: HobbyCategory) => category === 'all' ? entryHobbies.some((h) => h.id === c) : c === category,
    [category, entryHobbies]
  )

  const nextUp = useMemo(
    () => pickNextUp(entries.filter((e) => inScope(e.hobby_category)), profile, 8),
    [entries, profile, inScope]
  )
  const stalled = useMemo(
    () => profile.stalled.filter((s) => inScope(s.entry.hobby_category)),
    [profile, inScope]
  )
  const missingData = useMemo(() => entries.filter(needsTasteEnrichment).length, [entries])
  const ration = useMemo(() => discoverySlots(profile), [profile])

  // ── Actions ────────────────────────────────────────────────────────────────

  async function setStatus(e: Entry, status: Entry['status'], label: string) {
    setBusy(e.id)
    try {
      const patch: Partial<Entry> = { status }
      const today = new Date().toISOString().slice(0, 10)
      if (status === 'in_progress' && !e.date_started) patch.date_started = today
      if (status === 'completed') patch.date_completed = today
      await updateEntry(e.id, patch)
      // Leaving the backlog opens a gap in the ranking, so close it.
      if (e.status === 'backlog') await normalizeBacklogPriorities(e.hobby_category)
      toast.success(`${e.title} — ${label}`)
    } catch {
      toast.error(`Couldn't update ${e.title}`)
    } finally {
      setBusy(null)
    }
  }

  async function addCandidate(c: Candidate) {
    setBusy(c.external_id)
    try {
      await insertEntry({
        hobby_category: c.category,
        title: c.title,
        status: 'backlog',
        rating: null,
        notes: null,
        progress_current: 0,
        progress_total: c.progress_total,
        cover_url: c.cover_url,
        external_id: c.external_id,
        external_source: c.external_source,
        metadata: { ...c.metadata, added_via: 'suggestion' },
        book_subtype: (c.book_subtype as Entry['book_subtype']) ?? null,
        current_season: null,
        current_episode: null,
        priority: null,
        is_private: false,
        date_started: null,
        date_completed: null,
      })
      setCandidates((prev) => prev?.filter((x) => x.external_id !== c.external_id) ?? null)
      toast.success(`${c.title} added to your backlog`)
    } catch {
      toast.error(`Couldn't add ${c.title}`)
    } finally {
      setBusy(null)
    }
  }

  async function runEnrich() {
    setEnriching({ done: 0, total: missingData })
    try {
      const n = await backfillTaste((done, total) => setEnriching({ done, total }))
      await load()
      toast.success(n > 0 ? `Enriched ${n} ${n === 1 ? 'entry' : 'entries'}` : 'Nothing new found')
    } catch {
      toast.error('Enrichment failed partway — try again')
    } finally {
      setEnriching(null)
    }
  }

  const findCandidates = useCallback(async () => {
    setFinding(true)
    try {
      const cats = (category === 'all' ? entryHobbies.map((h) => h.id) : [category])
        .filter((c) => !HOBBY_MAP[c].manualOnly)
      const briefs = cats.flatMap((c) => {
        const brief = buildBrief(c, entries, profile)
        if (!brief) return []
        if (c !== 'books') return [brief]
        // Manga and prose come from different catalogues and read nothing alike,
        // so books get one brief per sub-type you actually track.
        const subs = [...new Set(entries.filter((e) => e.hobby_category === 'books').map((e) => e.book_subtype))]
        const wanted = subs.includes('manga') ? ['manga', 'book'] : ['book']
        return wanted.map((subtype) => ({ ...brief, subtype }))
      })
      if (briefs.length === 0) {
        setCandidates([])
        return
      }
      const raw = await fetchCandidates(briefs)
      setCandidates(excludeOwned(raw, entries))
    } finally {
      setFinding(false)
    }
  }, [category, entryHobbies, entries, profile])

  // Fetch once when Discover is first opened — not on page load, so the catalogs
  // only get hit when you actually ask for new things.
  useEffect(() => {
    if (mode === 'discover' && candidates === null && !finding && entries.length > 0) findCandidates()
  }, [mode, candidates, finding, entries.length, findCandidates])

  const discoveries: DiscoveryPick[] = useMemo(() => {
    if (!candidates) return []
    const byCat = new Map<HobbyCategory, DiscoveryPick[]>()
    for (const c of candidates) {
      if (!inScope(c.category)) continue
      const brief = buildBrief(c.category, entries, profile)
      const [scored] = scoreCandidates([c], profile, brief)
      const list = byCat.get(c.category) ?? []
      list.push(scored)
      byCat.set(c.category, list)
    }
    // The ration is per media type, so one noisy category can't eat every slot.
    return [...byCat.values()]
      .flatMap((list) => list.sort((a, b) => b.score - a.score).slice(0, ration.slots))
      .sort((a, b) => b.score - a.score)
  }, [candidates, entries, profile, inScope, ration.slots])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="mech-skeleton" style={{ height: 96, clipPath: CLIP, animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      </div>
    )
  }

  const activeMode = MODES.find((m) => m.id === mode)!

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 4 }}>
          SYSTEM / ADVISORY
        </p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: 0 }}>
          WHAT NEXT
        </h1>
      </div>

      {entries.length < 5 ? (
        <Panel accent="#7c3aed" title="NOT ENOUGH HISTORY YET">
          <Empty>
            Suggestions are built entirely from your own library — what you finish, what you
            drop, how long things take you.<br />
            Log a few more titles (and rate the ones you&apos;ve finished) and this page comes alive.
          </Empty>
        </Panel>
      ) : (
        <>
          {/* ── Profile readout ── */}
          <ProfileStrip profile={profile} />

          {/* ── Missing-data nudge ── */}
          {missingData > 0 && (
            <div style={{ marginBottom: 20, background: 'var(--bg-card)', border: '1px solid #d9770644', borderLeft: '2px solid #d97706', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', margin: 0, letterSpacing: '0.06em', lineHeight: 1.6 }}>
                {enriching
                  ? `Looking up genres — ${enriching.done} of ${enriching.total}…`
                  : `${missingData} ${missingData === 1 ? 'entry has' : 'entries have'} no genre data, so the engine is working blind on ${missingData === 1 ? 'it' : 'them'}.`}
              </p>
              <Btn color="#d97706" filled onClick={runEnrich} disabled={!!enriching}>
                {enriching ? 'Working…' : 'Fill in the gaps'}
              </Btn>
            </div>
          )}

          {/* ── Mode + category selector ── */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            {MODES.map((m) => {
              const on = mode === m.id
              const Icon = m.icon
              const count = m.id === 'next' ? nextUp.length : m.id === 'triage' ? stalled.length : null
              return (
                <button key={m.id} onClick={() => setMode(m.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px',
                    fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: on ? 700 : 400,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    background: on ? `${m.accent}22` : 'transparent',
                    border: `1px solid ${on ? m.accent : 'var(--border-dim)'}`,
                    color: on ? m.accent : 'var(--text-dim)', cursor: 'pointer', transition: 'all 0.12s ease',
                  }}>
                  <Icon size={13} /> {m.label}
                  {count ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, opacity: 0.7 }}>{count}</span> : null}
                </button>
              )
            })}
            <span style={{ flex: 1 }} />
            <select value={category} onChange={(e) => { setCategory(e.target.value as HobbyCategory | 'all'); setCandidates(null) }}
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border-dim)', color: 'var(--text-mid)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em', padding: '6px 9px', cursor: 'pointer', outline: 'none' }}>
              <option value="all">ALL CATEGORIES</option>
              {entryHobbies.map((h) => <option key={h.id} value={h.id}>{h.pluralLabel.toUpperCase()}</option>)}
            </select>
          </div>

          {/* ── Mode bodies ── */}
          {mode === 'next' && (
            <Panel accent={activeMode.accent}
              title="NEXT UP"
              sub="Picked from what you already own. Weighted by your own ranking, then corrected for what your history says you actually finish.">
              {nextUp.length === 0 ? (
                <Empty>Nothing in your backlog for this filter.<br />Your backlog being empty is the point — go find something in Discover.</Empty>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {nextUp.map((p, i) => (
                    <NextUpRow key={p.entry.id} pick={p} index={i} busy={busy === p.entry.id}
                      onStart={() => setStatus(p.entry, 'in_progress', 'started')}
                      onOpen={() => router.push(`/entry?id=${p.entry.id}`)} />
                  ))}
                </div>
              )}
            </Panel>
          )}

          {mode === 'triage' && (
            <Panel accent={activeMode.accent}
              title="FINISH OR DROP"
              sub={`Things you started and haven't touched in a month or more. This is the mode that makes your backlog smaller.`}>
              {stalled.length === 0 ? (
                <Empty>Nothing is stalled. Everything you&apos;ve started is still moving.</Empty>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {stalled.map((s) => (
                    <TriageRow key={s.entry.id} item={s} busy={busy === s.entry.id}
                      onDone={() => setStatus(s.entry, 'completed', 'marked finished')}
                      onDrop={() => setStatus(s.entry, 'dropped', 'dropped')}
                      onOpen={() => router.push(`/entry?id=${s.entry.id}`)} />
                  ))}
                </div>
              )}
            </Panel>
          )}

          {mode === 'discover' && (
            <Panel accent={activeMode.accent}
              title="DISCOVER"
              sub={ration.note}
              right={
                <Btn color="#22c55e" onClick={findCandidates} disabled={finding}>
                  {finding ? 'Searching…' : 'Refresh'}
                </Btn>
              }>
              {finding ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '32px 0' }}>
                  <Loader2 size={15} style={{ color: '#22c55e', animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.14em' }}>
                    SEARCHING THE CATALOGS
                  </span>
                </div>
              ) : discoveries.length === 0 ? (
                <Empty>
                  Nothing new to suggest for this filter.<br />
                  Rate a few finished titles highly — &ldquo;more like this&rdquo; is where the good
                  suggestions come from.
                </Empty>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {discoveries.map((d, i) => (
                    <DiscoverRow key={`${d.candidate.external_source}:${d.candidate.external_id}`}
                      pick={d} index={i} busy={busy === d.candidate.external_id}
                      onAdd={() => addCandidate(d.candidate)} />
                  ))}
                </div>
              )}
            </Panel>
          )}

          {/* ── Why: the model, laid bare ── */}
          <WhyPanel profile={profile} category={category} entryHobbies={entryHobbies.map((h) => h.id)} />
        </>
      )}
    </div>
  )
}

// ── Profile readout ──────────────────────────────────────────────────────────

function ProfileStrip({ profile }: { profile: TasteProfile }) {
  const topGenre = Object.values(profile.byCategory)
    .flatMap((t) => t?.genres ?? [])
    .filter((g) => g.evidence >= 1)
    .sort((a, b) => b.score - a.score)[0]

  const cells: Array<{ label: string; value: string; sub: string; accent: string }> = [
    {
      label: 'Your Pace',
      value: profile.pace.hoursPerWeek > 0 ? `${profile.pace.hoursPerWeek}h` : '—',
      sub: profile.pace.basis === 'none' ? 'no recent activity' : `per week, from your ${profile.pace.basis}`,
      accent: '#0891b2',
    },
    {
      label: 'Backlog',
      value: profile.backlogMonths != null ? `${profile.backlogMonths}mo` : `${profile.backlogHours}h`,
      sub: profile.backlogMonths != null ? `${profile.backlogHours}h at your pace` : 'estimated hours',
      accent: profile.backlogMonths != null && profile.backlogMonths > 12 ? '#ef4444' : '#d97706',
    },
    {
      label: 'Evidence',
      value: String(profile.totalEvidence),
      sub: 'finished or abandoned',
      accent: '#7c3aed',
    },
    {
      label: 'Strongest Taste',
      value: topGenre ? topGenre.tag : '—',
      sub: topGenre ? `${topGenre.finished} finished` : 'needs more genre data',
      accent: '#22c55e',
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>
      {cells.map((c) => (
        <div key={c.label} style={{ padding: '1px', clipPath: CLIP, background: `${c.accent}44` }}>
          <div style={{ background: 'var(--bg-card)', clipPath: CLIP, padding: '14px 16px', position: 'relative', height: '100%' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 12, height: 12, background: c.accent, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--text-dim)', textTransform: 'uppercase', margin: '0 0 8px' }}>
              {c.label}
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--text-hi)', lineHeight: 1, margin: '0 0 5px', textTransform: 'capitalize' }}>
              {c.value}
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mute)', letterSpacing: '0.08em', margin: 0 }}>
              {c.sub}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Rows ─────────────────────────────────────────────────────────────────────

function Row({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 14, padding: 14, background: 'var(--bg-base)', border: '1px solid var(--border-dim)', borderLeft: `2px solid ${accent}` }}>
      {children}
    </div>
  )
}

function NextUpRow({ pick, index, busy, onStart, onOpen }: {
  pick: NextUpPick; index: number; busy: boolean; onStart: () => void; onOpen: () => void
}) {
  const e = pick.entry
  const accent = HOBBY_MAP[e.hobby_category]?.accent ?? '#7c3aed'
  const h = entryHours(e)
  return (
    <Row accent={accent}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-mute)', width: 20, flexShrink: 0, paddingTop: 2 }}>
        {index + 1}
      </span>
      <Cover url={e.cover_url} title={e.title} accent={accent} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text-hi)', margin: '0 0 7px', letterSpacing: '0.04em' }}>
          {e.title}
        </p>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 2 }}>
          <Tag color={accent}>{HOBBY_MAP[e.hobby_category]?.label}</Tag>
          {h > 0 && <Tag>{hrs(h)}</Tag>}
          {pick.priorityRank != null && <Tag color="#d97706">your #{pick.priorityRank}</Tag>}
          {tagsOf(e).slice(0, 2).map((t) => <Tag key={t}>{t}</Tag>)}
        </div>
        {pick.override && (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#d97706', margin: '8px 0 0', letterSpacing: '0.04em', lineHeight: 1.5 }}>
            ⚠ {pick.override}
          </p>
        )}
        <Reasons items={pick.reasons} accent={accent} />
        <div style={{ marginTop: 10, maxWidth: 220 }}>
          <ScoreBar score={pick.score} accent={accent} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <Btn color={accent} filled onClick={onStart} disabled={busy}>Start</Btn>
        <Btn onClick={onOpen}>Open</Btn>
      </div>
    </Row>
  )
}

function TriageRow({ item, busy, onDone, onDrop, onOpen }: {
  item: TasteProfile['stalled'][number]; busy: boolean
  onDone: () => void; onDrop: () => void; onOpen: () => void
}) {
  const e = item.entry
  const hobbyAccent = HOBBY_MAP[e.hobby_category]?.accent ?? '#7c3aed'
  const verdictColor = item.verdict === 'finish' ? '#22c55e' : item.verdict === 'drop' ? '#ef4444' : 'var(--text-dim)'
  return (
    <Row accent={verdictColor}>
      <Cover url={e.cover_url} title={e.title} accent={hobbyAccent} size="sm" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text-hi)', margin: '0 0 7px', letterSpacing: '0.04em' }}>
          {e.title}
        </p>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <Tag color={verdictColor}>{item.verdict === 'unclear' ? 'your call' : item.verdict}</Tag>
          <Tag color={hobbyAccent}>{HOBBY_MAP[e.hobby_category]?.label}</Tag>
          <Tag color={item.touchSource === 'updated' ? 'var(--text-mute)' : undefined}>
            {item.daysSinceTouch}d idle{item.touchSource === 'updated' ? '?' : ''}
          </Tag>
          {item.progressPct != null && <Tag>{item.progressPct}%</Tag>}
          {item.hoursRemaining != null && item.hoursRemaining > 0 && <Tag>{hrs(item.hoursRemaining)} left</Tag>}
        </div>
        <Reasons items={[item.reason, touchLine(item.touchSource, item.touchedAt)]} accent={verdictColor} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <Btn color="#22c55e" filled={item.verdict === 'finish'} onClick={onDone} disabled={busy}>Finished</Btn>
        <Btn color="#ef4444" filled={item.verdict === 'drop'} onClick={onDrop} disabled={busy}>Drop</Btn>
        <Btn onClick={onOpen}>Open</Btn>
      </div>
    </Row>
  )
}

function DiscoverRow({ pick, index, busy, onAdd }: {
  pick: DiscoveryPick; index: number; busy: boolean; onAdd: () => void
}) {
  const c = pick.candidate
  const accent = HOBBY_MAP[c.category]?.accent ?? '#22c55e'
  return (
    <Row accent={accent}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-mute)', width: 20, flexShrink: 0, paddingTop: 2 }}>
        {index + 1}
      </span>
      <Cover url={c.cover_url} title={c.title} accent={accent} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text-hi)', margin: '0 0 7px', letterSpacing: '0.04em' }}>
          {c.title} {c.year ? <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>({c.year})</span> : null}
        </p>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <Tag color={accent}>{HOBBY_MAP[c.category]?.label}</Tag>
          {c.hours != null && c.hours > 0 && <Tag>{hrs(c.hours)}</Tag>}
          {c.ongoing && <Tag color="#d97706">still airing</Tag>}
          {c.tags.slice(0, 3).map((t) => <Tag key={t}>{t}</Tag>)}
        </div>
        <Reasons items={pick.reasons} accent={accent} />
        <div style={{ marginTop: 10, maxWidth: 220 }}>
          <ScoreBar score={pick.score} accent={accent} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <Btn color={accent} filled onClick={onAdd} disabled={busy}>+ Backlog</Btn>
      </div>
    </Row>
  )
}

// ── The model, laid bare ─────────────────────────────────────────────────────

function WhyPanel({ profile, category, entryHobbies }: {
  profile: TasteProfile; category: HobbyCategory | 'all'; entryHobbies: HobbyCategory[]
}) {
  const [open, setOpen] = useState(false)
  const cats = (category === 'all' ? entryHobbies : [category]).filter((c) => profile.byCategory[c])

  return (
    <div style={{ marginTop: 24 }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'transparent', border: '1px solid var(--border-dim)', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>
        <RefreshCw size={12} /> {open ? 'Hide' : 'Show'} what the engine thinks it knows
      </button>

      {open && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {profile.lengthSensitivity > 0.05 && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#d97706', margin: 0, letterSpacing: '0.04em', lineHeight: 1.6 }}>
              Your reviews complain about things running long more often than they praise tight
              pacing, so long titles are marked down a little beyond what your finish rate alone
              would say.
            </p>
          )}
          {cats.map((cat) => {
            const t = profile.byCategory[cat]!
            const accent = HOBBY_MAP[cat].accent
            const top = t.genres.filter((g) => g.evidence >= 1).slice(0, 5)
            const bottom = t.genres.filter((g) => g.evidence >= 1 && g.score < -0.05).slice(-4).reverse()
            const buckets = t.buckets.filter((b) => b.finished + b.abandoned > 0)
            return (
              <Panel key={cat} accent={accent}
                title={HOBBY_MAP[cat].pluralLabel.toUpperCase()}
                sub={t.confident
                  ? `${t.sample} decided items · you finish ${Math.round(t.overallFinishRate * 100)}% of what you start`
                  : `Only ${t.sample} decided ${t.sample === 1 ? 'item' : 'items'} — not enough to be confident yet`}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 22 }}>
                  <div>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mute)', letterSpacing: '0.18em', margin: '0 0 10px' }}>
                      GENRE AFFINITY
                    </p>
                    {top.length === 0 ? (
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mute)', margin: 0 }}>No genre data yet.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[...top, ...bottom.filter((b) => !top.includes(b))].map((g) => (
                          <div key={g.tag} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                              {g.tag}
                            </span>
                            {/* Centre-anchored bar: right of centre is a yes, left is a no. */}
                            <div style={{ width: 90, height: 5, background: 'var(--bg-base)', border: '1px solid var(--border-dim)', position: 'relative', flexShrink: 0 }}>
                              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border-dim)' }} />
                              <div style={{
                                position: 'absolute', top: 0, bottom: 0,
                                left: g.score >= 0 ? '50%' : `${50 + Math.max(-50, g.score * 100)}%`,
                                width: `${Math.min(50, Math.abs(g.score) * 100)}%`,
                                background: g.score >= 0 ? accent : '#ef4444',
                              }} />
                            </div>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mute)', width: 44, textAlign: 'right', flexShrink: 0 }}>
                              {g.finished}✓ {g.abandoned}✕
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mute)', letterSpacing: '0.18em', margin: '0 0 10px' }}>
                      FINISH RATE BY LENGTH
                    </p>
                    {buckets.length === 0 ? (
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mute)', margin: 0 }}>No length data yet.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {buckets.map((b) => {
                          const n = b.finished + b.abandoned
                          const rate = b.raw ?? 0
                          return (
                            <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', width: 62, flexShrink: 0 }}>{b.label}</span>
                              <div style={{ flex: 1, height: 5, background: 'var(--bg-base)', border: '1px solid var(--border-dim)' }}>
                                <div style={{ height: '100%', width: `${Math.round(rate * 100)}%`, background: rate >= 0.5 ? accent : '#ef4444' }} />
                              </div>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mute)', width: 56, textAlign: 'right', flexShrink: 0 }}>
                                {Math.round(rate * 100)}% of {n}
                              </span>
                            </div>
                          )
                        })}
                        {t.medianFinishedHours != null && (
                          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mute)', margin: '4px 0 0', letterSpacing: '0.06em', lineHeight: 1.6 }}>
                            Median finished: {hrs(t.medianFinishedHours)}
                            {t.longestFinishedHours != null && ` · longest: ${hrs(t.longestFinishedHours)}`}
                            {t.abandonedMedianHours != null && ` · median abandoned: ${hrs(t.abandonedMedianHours)}`}
                          </p>
                        )}
                        {t.ongoing && t.ongoing.finished + t.ongoing.abandoned > 0 && (
                          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mute)', margin: 0, letterSpacing: '0.06em' }}>
                            Still-airing shows: finished {t.ongoing.finished} of {t.ongoing.finished + t.ongoing.abandoned}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Panel>
            )
          })}
          {profile.ratingBaseline && profile.ratingBaseline.count >= 5 && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mute)', margin: 0, letterSpacing: '0.06em', lineHeight: 1.7 }}>
              Your ratings average {Math.round(profile.ratingBaseline.mean * 10) / 10}/10 across{' '}
              {profile.ratingBaseline.count} items (spread ±{Math.round(profile.ratingBaseline.sd * 10) / 10}).
              Scores are read against your own scale, not against 10 — an 8 from someone who rates
              everything 9 is a complaint.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
