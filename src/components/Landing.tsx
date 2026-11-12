'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'
import { HOBBIES, HOBBY_MAP, STATUS_COLORS } from '@/lib/hobbies'
import type { HobbyCategory } from '@/types/database'
import { HOBBY_ICON_MAP } from './hobbyIcons'
import { AuthCard } from './AuthShell'
import { LoginForm, initialAuthMode, AUTH_EMAIL_ID, type AuthMode } from './LoginScreen'

// What a signed-out visitor sees: what Hobbylog is, shown with its own
// interface, with the sign-in form on the first screen so a returning user is
// never more than one field away from their library.
//
// The examples below are the app's real components in miniature, filled with a
// sample library. Tiles show titles rather than cover art on purpose: that is
// how the app draws an entry it has no artwork for, and it keeps other
// people's artwork out of a page nobody has signed in to yet.

const CLIP = 'polygon(10px 0%, 100% 0%, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0% 100%, 0% 10px)'

interface Sample { title: string; hobby: HobbyCategory; rating?: number; rank?: number; status?: 'backlog' | 'in_progress' | 'completed' | 'wishlist'; pct?: number; note?: string }

const STRIP: Sample[] = [
  { title: 'Hollow Knight', hobby: 'games', rating: 9.5 },
  { title: 'Dune: Part Two', hobby: 'movies', rating: 9 },
  { title: 'Piranesi', hobby: 'books', rating: 10 },
  { title: 'Severance', hobby: 'tv', pct: 74 },
  { title: 'MG RX-78-2 Ver. 3.0', hobby: 'gundams', pct: 50 },
  { title: 'Shakshuka', hobby: 'cooking', rating: 9 },
  { title: 'Outer Wilds', hobby: 'games', rating: 10 },
  { title: 'Harbor at Dusk', hobby: 'art', rating: 7 },
  { title: 'Past Lives', hobby: 'movies', rating: 9.5 },
]

const LIBRARY: Sample[] = [
  { title: "Baldur's Gate 3", hobby: 'games', status: 'in_progress', pct: 81, note: '61 of 75 hrs' },
  { title: 'Hades II', hobby: 'games', status: 'backlog', rank: 1 },
  { title: 'Citizen Sleeper', hobby: 'games', status: 'backlog', rank: 2 },
  { title: 'Metaphor: ReFantazio', hobby: 'games', status: 'wishlist' },
  { title: 'Disco Elysium', hobby: 'games', status: 'completed', rating: 10 },
]

const RANKED = [
  { title: 'Hades II', why: 'About 25 hours. You finish most games this length.' },
  { title: 'Citizen Sleeper', why: 'About 8 hours. Fits a weekend.' },
  { title: 'Return of the Obra Dinn', why: 'About 8 hours.' },
]

const SHELF: Sample[] = [
  { title: 'Project Hail Mary', hobby: 'books', rating: 9, note: 'Oct 8' },
  { title: 'Shogun', hobby: 'tv', rating: 9.5, note: 'Jul 25' },
  { title: 'Outer Wilds', hobby: 'games', rating: 10, note: 'Jun 15' },
  { title: 'Piranesi', hobby: 'books', rating: 10, note: 'Apr 26' },
]

const STATUS_NAME = { wishlist: 'Wishlist', backlog: 'Backlog', in_progress: 'In Progress', completed: 'Completed' } as const

function DemoTile({ s, showMeta = true }: { s: Sample; showMeta?: boolean }) {
  const accent = HOBBY_MAP[s.hobby].accent
  return (
    <div>
      <div style={{ padding: 1, clipPath: CLIP, background: `${accent}66` }}>
        <div style={{ position: 'relative', aspectRatio: '2 / 3', clipPath: CLIP, background: `linear-gradient(160deg, ${accent}33, var(--bg-card) 72%)`, display: 'flex', alignItems: 'flex-end', padding: 10, overflow: 'hidden' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 12.5, fontWeight: 700, lineHeight: 1.25, color: accent, overflowWrap: 'break-word', minWidth: 0, maxWidth: '100%' }}>{s.title}</span>
          {s.rank != null && (
            <span style={{ position: 'absolute', top: 7, left: 11, padding: '1px 6px', fontFamily: 'var(--font-mono)', fontSize: 12, color: '#fbbf24', background: 'rgba(8,10,14,0.82)', border: '1px solid #d9770688' }}>#{s.rank}</span>
          )}
          {s.rating != null && (
            <span style={{ position: 'absolute', top: 7, right: 7, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 6px', fontFamily: 'var(--font-mono)', fontSize: 12, color: '#fbbf24', background: 'rgba(8,10,14,0.82)', border: '1px solid #d9770688' }}>
              <Star size={10} aria-hidden="true" style={{ fill: '#fbbf24', color: '#fbbf24' }} />{s.rating}
            </span>
          )}
          {s.pct != null && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: 'rgba(8,10,14,0.7)' }}>
              <div style={{ height: '100%', width: `${s.pct}%`, background: accent }} />
            </div>
          )}
        </div>
      </div>
      {showMeta && (
        <>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 600, lineHeight: 1.3, color: 'var(--text-hi)', margin: '8px 0 0' }}>{s.title}</p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--text-dim)', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {s.status && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: STATUS_COLORS[s.status] }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[s.status] }} />
                {STATUS_NAME[s.status]}
              </span>
            )}
            {!s.status && <span style={{ color: accent }}>{HOBBY_MAP[s.hobby].label}</span>}
            {s.note && <span>{s.note}</span>}
          </p>
        </>
      )}
    </div>
  )
}

function Wordmark({ size = 15 }: { size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg width={size * 1.8} height={size * 1.8} viewBox="0 0 400 400" aria-hidden="true" style={{ flexShrink: 0 }}>
        <polygon points="52,0 400,0 400,348 348,400 0,400 0,52" fill="#0d1117" />
        <polygon points="0,0 52,0 0,52" fill="#a577f2" />
        <polygon points="52,0 400,0 400,348 348,400 0,400 0,52" fill="none" stroke="#a577f2" strokeWidth="8" />
        <rect x="54" y="72" width="80" height="272" fill="#e2e8f0" />
        <rect x="54" y="200" width="218" height="38" fill="#e2e8f0" />
        <rect x="148" y="302" width="62" height="42" fill="#a577f2" />
        <rect x="220" y="200" width="62" height="144" fill="#a577f2" />
        <rect x="292" y="72" width="68" height="272" fill="#a577f2" />
      </svg>
      <span translate="no" style={{ fontFamily: 'var(--font-display)', fontSize: size, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.05em' }}>HOBBYLOG</span>
    </span>
  )
}

const FAQ = [
  { q: 'Do I have to import anything?', a: 'No. Add things by hand, one search at a time. If you want a head start, you can import from Steam, MyAnimeList, Goodreads and Letterboxd.' },
  { q: 'Who can see my library?', a: 'Only friends you have accepted. You can also mark any single entry as private.' },
  { q: 'Can I get my data out?', a: 'Yes. Settings has an export to an Excel workbook or CSV files, with every entry and every session you logged.' },
]

export default function Landing() {
  const [mode, setMode] = useState<AuthMode>(initialAuthMode)

  // A call to action anywhere on the page sets the form's mode and hands it
  // focus, which also brings it into view.
  function goToForm(next: AuthMode) {
    setMode(next)
    document.getElementById(AUTH_EMAIL_ID)?.focus()
  }

  return (
    <div className="landing">
      <div aria-hidden="true" className="landing-grid" />
      <a href="#auth" className="skip-link">Skip to sign in</a>

      <header className="landing-nav">
        <Wordmark />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" className="landing-link" onClick={() => goToForm('signin')}>Sign In</button>
          <button type="button" className="landing-cta landing-cta-small" onClick={() => goToForm('signup')}>Create Account</button>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-pitch landing-enter">
            <h1>One log for everything you play, watch, read and make.</h1>
            <p>
              Games, films, shows, books, model kits, workouts, art and recipes in a single library.
              See what you have, decide what is next, and keep a record of what you finished.
            </p>
            <div className="landing-hero-actions">
              <button type="button" className="landing-cta" onClick={() => goToForm('signup')}>Create Your Account</button>
            </div>
          </div>
          <div id="auth" className="landing-auth landing-enter" style={{ animationDelay: '80ms' }}>
            <AuthCard>
              <LoginForm mode={mode} onModeChange={setMode} />
            </AuthCard>
          </div>
        </section>

        {/* One row of the sample library, as the app would draw it. */}
        <div className="landing-strip" role="img" aria-label="A sample library: games, films, books, a TV show, a model kit, a recipe and a painting, each as a tile with its rating or progress.">
          {STRIP.map((s, i) => (
            <div key={s.title} className="landing-enter" style={{ animationDelay: `${160 + i * 45}ms` }}>
              <DemoTile s={s} showMeta={false} />
            </div>
          ))}
        </div>

        <section className="landing-row">
          <div className="landing-copy">
            <h2>Your whole library, by cover</h2>
            <p>
              Each hobby is a wall of covers you can filter by status: wishlist, backlog, in progress, completed.
              Search a title when you add it and the artwork and details fill in for you.
            </p>
          </div>
          <div className="landing-demo" role="img" aria-label="Example: a games library with one game in progress, two ranked in the backlog, one on the wishlist and one completed.">
            <div className="landing-tiles">
              {LIBRARY.map((s) => <DemoTile key={s.title} s={s} />)}
            </div>
          </div>
        </section>

        <section className="landing-row landing-row-flip">
          <div className="landing-copy">
            <h2>Know what is next</h2>
            <p>
              Drag your backlog into the order you mean to tackle it. What Next reads your own history,
              how long things take you and what you tend to finish, and suggests something that fits the time you have.
            </p>
          </div>
          <div className="landing-demo" role="img" aria-label="Example: a ranked backlog of three games, each with a reason it is suggested.">
            <ol className="landing-rank">
              {RANKED.map((r, i) => (
                <li key={r.title}>
                  <span className="landing-rank-num">{i + 1}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="landing-rank-title">{r.title}</span>
                    <span className="landing-rank-why">{r.why}</span>
                  </span>
                  {i === 0 && <span className="landing-rank-next">Up next</span>}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="landing-row">
          <div className="landing-copy">
            <h2>Keep what you finished</h2>
            <p>
              Finished entries go on your Shelf with the date and your rating, grouped by year.
              Log sessions along the way and your hours add up on their own.
            </p>
          </div>
          <div className="landing-demo" role="img" aria-label="Example: a shelf for one year showing four finished entries with their ratings and finish dates.">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, borderBottom: '1px solid var(--border-dim)', paddingBottom: 8 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)' }}>2026</span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)' }}>4 finished</span>
            </div>
            <div className="landing-tiles landing-tiles-4">
              {SHELF.map((s) => <DemoTile key={s.title} s={s} />)}
            </div>
          </div>
        </section>

        <section className="landing-track">
          <h2>{HOBBIES.length} hobbies, one place</h2>
          <p>Turn on the ones you want. Each keeps its own library, and they all add up on one dashboard.</p>
          <ul>
            {HOBBIES.map((h) => {
              const Icon = HOBBY_ICON_MAP[h.icon]
              return (
                <li key={h.id} style={{ borderColor: `${h.accent}66` }}>
                  <span aria-hidden="true" style={{ display: 'flex', color: h.accent }}>{Icon && <Icon size={18} />}</span>
                  {h.pluralLabel}
                </li>
              )
            })}
          </ul>
        </section>

        <section className="landing-faq">
          <h2>Before you start</h2>
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </section>

        <section className="landing-close">
          <h2>Start with one thing you are in the middle of.</h2>
          <button type="button" className="landing-cta" onClick={() => goToForm('signup')}>Create Your Account</button>
        </section>
      </main>

      <footer className="landing-footer">
        <Wordmark size={12} />
        <button type="button" className="landing-link" onClick={() => goToForm('signin')}>Sign In</button>
      </footer>
    </div>
  )
}
