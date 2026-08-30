# Hobbylog

One backlog for everything you play, watch, and read — video games, movies, TV shows, books, manga, plus manual hobbies like model kits and art, and a full workout tracker for fitness. Search to add with cover art and details filled in automatically, rank what to tackle next, log your progress, and see how you stack up against your friends.

**▶ Live app: [hobbylog-web.vercel.app](https://hobbylog-web.vercel.app)**

Just sign up with an email and password — there's nothing to install and no API keys to configure. Everything runs in the browser and syncs to the cloud, so your library is the same on your phone and your computer.

> This is the hosted successor to the original desktop app. The desktop build and its phone companion have been retired — the web app is where everything happens now.

---

## What you can do

- **Track seven hobby types** — games, movies, TV, books (with manga / audiobook / comic / light-novel sub-types), manual-entry projects and art, and fitness.
- **Fitness is its own thing** — build workout routines from a bundled catalog of 873 exercises (or type your own), log sets and reps, and track personal records, progress charts, streaks and goals. Exercises measure what suits them: weight × reps, plain reps, a timed hold, or time + distance for runs.
- **Search to add** — type a title and pick from live results. Cover art, runtime / episode counts / time-to-beat, and other details fill in automatically (RAWG for games, TMDB for movies & TV, OpenLibrary for books, MyAnimeList for manga).
- **Rank your backlog** — drag entries into priority order; new items join at the bottom.
- **Log progress & sessions** — track hours, pages, or episodes, and keep a session history per entry.
- **Rate & review** — score out of 10 and leave a field-report review when you finish something.
- **Stats** — hours backlogged vs. finished, completion rates, top-rated, and a **"You vs. the Field"** benchmark against the average of everyone on the app.
- **Friends** — search someone by username, send a request, and once you're both in, browse each other's libraries. When you've both finished the same title, see your rating head-to-head. On any entry you'll also see **the crowd's** average score.
- **Steam** — connect with one click ("Sign in through Steam"), then sync playtime onto your games or import your whole library.
- **Import your existing lists** — MyAnimeList (`.xml`), Letterboxd (`.csv`), and Goodreads (`.csv`).
- **Themes** — dark and light, with the same mech / blueprint aesthetic throughout.

## Getting started

1. Open **[hobbylog-web.vercel.app](https://hobbylog-web.vercel.app)** and create an account.
2. On first launch, pick which hobbies you want to track (you can change this anytime in Settings).
3. Set a **username** in Settings so friends can find you.
4. Start adding — hit **Add Entry**, search a title, and go. (Connecting Steam or importing a list from the **Import** page is a fast way to fill your library.)

---

## For developers

A real server-rendered Next.js app (not a static export) deployed on Vercel, backed by Supabase.

**Stack:** Next.js 16 · React 19 · Tailwind CSS v4 · Supabase (Postgres + Auth + Row-Level Security) · Vercel.

### Architecture notes

- `src/lib/db.ts` is a data adapter that mirrors the original desktop app's `db.ts` API surface, but backed by Supabase — which is what let the desktop UI components port over almost unchanged.
- Per-user data lives in `web_entries`, `web_sessions`, `web_photos`, `web_notes`, and `web_profile`, each protected by RLS (`auth.uid() = user_id`). Friends can read each other's entries via an `are_friends()`-gated policy; aggregate stats and username lookups go through `SECURITY DEFINER` RPCs restricted to authenticated users.
- External catalog searches run **server-side** in Next.js route handlers (`/api/search`, `/api/details`) so the API keys stay secret and friends need zero setup. Steam uses OpenID 2.0 (`/api/steam/*`) with one shared server-side key.

### Environment

The Supabase URL and public anon key are in `src/lib/supabaseClient.ts` (the anon key is public by design — RLS is what protects the data). Server-only secrets are set as Vercel environment variables:

| Variable | Used for |
|---|---|
| `RAWG_API_KEY` | Game search (RAWG) |
| `TMDB_API_KEY` | Movie & TV search + details (TMDB) |
| `STEAM_API_KEY` | Steam library / playtime (shared across all users) |

### Running locally

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
```

Set `RAWG_API_KEY`, `TMDB_API_KEY`, and `STEAM_API_KEY` in a `.env.local` file to exercise search and Steam locally.

### Deploying

Push to `main` — Vercel builds and deploys automatically. Commits must be authored with the email tied to the connected GitHub account or Vercel blocks the deploy.
