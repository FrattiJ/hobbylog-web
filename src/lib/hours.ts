import type { Entry } from '@/types/database'

// Single source of truth for estimated hours so the dashboard and stats page can't drift.
// basis 'full'  — full length of each entry: games time-to-beat, whole movie/audiobook
//                 runtime, every TV episode. Use for backlog ("time remaining") and
//                 completed ("hours finished") estimates.
// basis 'spent' — time consumed so far: TV counts episodes watched. Games, movies, and
//                 audiobooks don't track minutes consumed, so they use full length.
export function calcHours(items: Entry[], basis: 'full' | 'spent'): number {
  let total = 0
  for (const e of items) {
    if (e.hobby_category === 'games' && e.metadata?.time_to_beat) {
      total += Number(e.metadata.time_to_beat) || 0
    } else if (
      (e.hobby_category === 'movies' || (e.hobby_category === 'books' && e.book_subtype === 'audiobook')) &&
      e.progress_total
    ) {
      total += e.progress_total / 60 // stored in minutes
    } else if (e.hobby_category === 'tv') {
      const episodes = basis === 'full' ? e.progress_total : e.progress_current
      if (episodes) {
        const minPerEp = (e.metadata?.episode_runtime as number) || 22
        total += (episodes * minPerEp) / 60
      }
    }
  }
  return Math.round(total * 10) / 10
}
