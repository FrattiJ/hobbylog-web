'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, X } from 'lucide-react'
import { CHANGELOG, markChangelogSeen, type TourPreview } from '@/lib/changelog'
import { STATUS_COLORS } from '@/lib/hobbies'
import { CLIP } from './MechCard'
import { DemoTile, LIBRARY, SHELF } from './Landing'

// What's New, shown once per release. A release with a `tour` opens on it: a
// few headline changes, one per step, each with a miniature of the page it is
// about, and a last button that goes to the feature. The full list of changes
// is one click away from any step, and is all there is for a release without
// a tour. However it is left (finished, skipped, Escape, the backdrop), the
// release is marked seen.

const ACCENT = '#a577f2'

// ── Step miniatures ──────────────────────────────────────────────────────────
// Drawn with the same sample library as the signed-out page, not screenshots:
// they follow the theme, stay sharp at any size, and cannot go stale the way a
// captured image does when the page changes.

const TABS: { name: string; count: number; color: string }[] = [
  { name: 'All', count: 42, color: ACCENT },
  { name: 'Wishlist', count: 6, color: STATUS_COLORS.wishlist },
  { name: 'Backlog', count: 19, color: STATUS_COLORS.backlog },
  { name: 'In Progress', count: 3, color: STATUS_COLORS.in_progress },
  { name: 'Completed', count: 14, color: STATUS_COLORS.completed },
]

function CoversPreview() {
  return (
    <>
      <div className="tab-row" style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {TABS.map((t, i) => (
          <span key={t.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 11px', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, border: `1px solid ${i === 0 ? t.color : 'var(--border-dim)'}`, background: i === 0 ? `${t.color}22` : 'transparent', color: i === 0 ? 'var(--text-hi)' : 'var(--text-mid)' }}>
            {t.name}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>{t.count}</span>
          </span>
        ))}
      </div>
      <div className="landing-tiles">
        {LIBRARY.map((s) => <DemoTile key={s.title} s={s} />)}
      </div>
    </>
  )
}

// Finished and added per month, as the Stats page pairs them.
const MONTHS: { label: string; finished: number; added: number }[] = [
  { label: 'Jun', finished: 2, added: 5 },
  { label: 'Jul', finished: 3, added: 4 },
  { label: 'Aug', finished: 1, added: 6 },
  { label: 'Sep', finished: 4, added: 2 },
  { label: 'Oct', finished: 5, added: 3 },
  { label: 'Nov', finished: 6, added: 2 },
]
const MONTH_MAX = 6
const FINISHED = '#22c55e'

function StatsPreview() {
  const legend = (color: string, name: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 10, background: color }} />{name}
    </span>
  )
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, color: 'var(--text-hi)' }}>Finished and added</span>
        <span style={{ display: 'flex', gap: 14, fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--text-dim)' }}>
          {legend(FINISHED, 'Finished')}{legend('var(--text-mute)', 'Added')}
        </span>
      </div>
      <div className="tour-bars">
        {MONTHS.map((m) => (
          <div key={m.label}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, flex: 1 }}>
              <div style={{ flex: 1, height: `${(m.finished / MONTH_MAX) * 100}%`, background: FINISHED }} />
              <div style={{ flex: 1, height: `${(m.added / MONTH_MAX) * 100}%`, background: 'var(--text-mute)' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', borderTop: '1px solid var(--border-dim)', paddingTop: 4 }}>{m.label}</span>
          </div>
        ))}
      </div>
      <dl className="month-strip" style={{ margin: '16px 0 0', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', border: '1px solid var(--border-dim)', background: 'var(--bg-card)' }}>
        <div><dt>Months of backlog</dt><dd>5.4</dd></div>
        <div><dt>Finish rate</dt><dd>68%</dd></div>
        <div><dt>Days to finish</dt><dd>23</dd></div>
      </dl>
    </>
  )
}

function ShelfPreview() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, borderBottom: '1px solid var(--border-dim)', paddingBottom: 8 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)' }}>2026</span>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)' }}>4 finished</span>
      </div>
      <div className="landing-tiles landing-tiles-4" style={{ maxWidth: 520 }}>
        {SHELF.map((s) => <DemoTile key={s.title} s={s} />)}
      </div>
    </>
  )
}

const PREVIEWS: Record<TourPreview, () => React.ReactElement> = {
  covers: CoversPreview,
  stats: StatsPreview,
  shelf: ShelfPreview,
}

// ── Dialog ───────────────────────────────────────────────────────────────────

export default function WhatsNew({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const latest = CHANGELOG[0]
  const tour = latest.tour
  const steps = tour?.steps ?? []
  const [view, setView] = useState<'tour' | 'notes'>(tour ? 'tour' : 'notes')
  const [step, setStep] = useState(0)
  // Which way the incoming step slides in from: forward steps arrive from the
  // right, going back from the left.
  const [dir, setDir] = useState<1 | -1>(1)
  const panel = useRef<HTMLDivElement>(null)
  const primary = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => { markChangelogSeen(); onClose() }, [onClose])

  const go = useCallback((to: number) => {
    if (to < 0 || to >= steps.length) return
    setStep((cur) => { setDir(to >= cur ? 1 : -1); return to })
  }, [steps.length])

  function finish() {
    close()
    if (tour) router.push(tour.cta.href)
  }

  // Focus starts on the button that moves things forward, so Enter walks the
  // whole tour.
  useEffect(() => { primary.current?.focus() }, [view])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return }
      if (view === 'tour') {
        if (e.key === 'ArrowRight') go(step + 1)
        if (e.key === 'ArrowLeft') go(step - 1)
      }
      // Keep Tab inside the dialog: the page behind it is inert in every way
      // but this one.
      if (e.key === 'Tab' && panel.current) {
        const stops = panel.current.querySelectorAll<HTMLElement>('button, a[href], summary')
        if (stops.length === 0) return
        const first = stops[0], last = stops[stops.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || !panel.current.contains(active))) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && (active === last || !panel.current.contains(active))) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, go, step, view])

  const current = steps[step]
  const Preview = current ? PREVIEWS[current.preview] : null
  const isLast = step === steps.length - 1
  const eyebrow: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', margin: 0, color: ACCENT }

  return (
    <div onClick={(e) => { if (e.currentTarget === e.target) close() }}
      style={{ overscrollBehavior: 'contain', position: 'fixed', inset: 0, zIndex: 90, background: 'var(--overlay)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'clamp(12px, 6vh, 56px) 12px', overflowY: 'auto' }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="whatsnew-title"
        style={{ width: '100%', maxWidth: view === 'tour' ? 720 : 520, padding: 1, clipPath: CLIP, background: `${ACCENT}66` }}>
        <div style={{ background: 'var(--bg-card)', clipPath: CLIP, padding: 'clamp(18px, 4vw, 28px)', position: 'relative' }}>
          <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, width: 14, height: 14, background: ACCENT, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <p style={eyebrow}>NEW IN HOBBYLOG <span style={{ fontWeight: 500, letterSpacing: '0.04em', color: 'var(--text-dim)' }}>v{latest.version}</span></p>
            <button type="button" aria-label="Close" onClick={close}
              style={{ width: 40, height: 40, margin: '-8px -8px -8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-mid)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          {view === 'tour' && current && Preview ? (
            <>
              <div key={step} className="tour-step" style={{ ['--tour-from' as string]: `${dir * 16}px` }}>
                <div className="tour-preview" role="img" aria-label={current.previewLabel}>
                  <Preview />
                </div>
                {/* Announced on every step change, so a screen reader hears the
                    position, the claim and the detail without hunting for them. */}
                <div aria-live="polite" aria-atomic="true">
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)', margin: '20px 0 6px' }}>{step + 1} of {steps.length}</p>
                  <h2 id="whatsnew-title" style={{ fontFamily: 'var(--font-body)', fontSize: 'clamp(22px, 4.6vw, 28px)', fontWeight: 700, letterSpacing: 0, lineHeight: 1.2, color: 'var(--text-hi)', margin: 0 }}>{current.title}</h2>
                  {/* Room for three lines, so the buttons do not jump between steps. */}
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, lineHeight: 1.55, color: 'var(--text-mid)', margin: '10px 0 0', maxWidth: '56ch', minHeight: '4.65em' }}>{current.body}</p>
                </div>
              </div>

              <div className="tour-footer">
                <div className="tour-dots">
                  {steps.map((s, i) => (
                    <button key={s.title} type="button" className="tour-dot" aria-label={`Step ${i + 1} of ${steps.length}: ${s.title}`} aria-current={i === step ? 'step' : undefined} onClick={() => go(i)}>
                      <span />
                    </button>
                  ))}
                </div>
                <div className="tour-actions">
                  {!isLast && <button type="button" className="tour-text-btn" onClick={close}>Skip</button>}
                  {step > 0 && <button type="button" className="tour-text-btn" onClick={() => go(step - 1)}>Back</button>}
                  <button ref={primary} type="button" className="tour-next" onClick={() => (isLast ? finish() : go(step + 1))}>
                    {isLast ? tour!.cta.label : 'Next'}
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <p style={{ margin: '18px 0 0', paddingTop: 14, borderTop: '1px solid var(--border-dim)', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)' }}>
                {latest.items.length} changes in this release.{' '}
                <button type="button" onClick={() => setView('notes')}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-hi)', textDecoration: 'underline' }}>
                  See all of them
                </button>
              </p>
            </>
          ) : (
            <>
              <h2 id="whatsnew-title" style={{ fontFamily: 'var(--font-body)', fontSize: 24, fontWeight: 700, letterSpacing: 0, lineHeight: 1.2, color: 'var(--text-hi)', margin: '0 0 2px' }}>Everything in v{latest.version}</h2>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)', margin: '0 0 18px' }}>{latest.date}</p>

              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {latest.items.map((it, i) => (
                  <li key={i} style={{ display: 'flex', gap: 10, fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-mid)', lineHeight: 1.55 }}>
                    <span aria-hidden="true" style={{ flexShrink: 0, fontSize: 13, color: ACCENT }}>▸</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                {tour && <button type="button" className="tour-text-btn" onClick={() => setView('tour')}>Back to the tour</button>}
                <button ref={primary} type="button" className="tour-next" onClick={close}>Got it</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
