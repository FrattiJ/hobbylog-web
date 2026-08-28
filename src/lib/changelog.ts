// Bump APP_VERSION and add an entry when shipping tester-visible changes — the
// "What's New" popup fires for anyone whose last-seen version is older.
export const APP_VERSION = '0.8.0'

export interface ChangelogEntry { version: string; date: string; items: string[] }

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.8.0',
    date: 'Aug 2026',
    items: [
      'Fitness is now a real workout tracker — build routines, log every set, chase records',
      'Build routines from a built-in catalog of 873 exercises, or type in your own',
      'Exercises track what actually fits them: weight × reps, reps, a timed hold, or time + distance for runs',
      'Last session\'s numbers show up as you log, so you always know what to beat',
      'Personal records tracked automatically — heaviest lift, estimated 1RM, best pace, longest hold',
      'Progress charts per exercise, plus a consistency heatmap and workout streaks',
      'Schedule a routine to a weekday — it loads itself on the Today tab when that day comes around',
      'Set fitness goals ("Bench 225", "sub-8:00 mile") that tick over the moment you hit them, or plain reminders you check off',
      'An unfinished workout is saved as you go, so a refresh mid-session won\'t lose it',
    ],
  },
  {
    version: '0.7.0',
    date: 'Aug 2026',
    items: [
      'Projects: build checklists that drive your % progress (great for gundams, art, builds)',
      'Backlog Priority — one ranked list across every hobby for "what do I tackle next?"',
      'Per-entry privacy: mark any entry private so friends don\'t see it',
      'Audiobooks now pull real listening length + narrator from Audible',
      'Games: a Sync Steam button (playtimes + new purchases) that follows your settings',
      'Select multiple entries to delete or change status in one go',
      'Upload your own cover image when adding an entry',
      'Tap a friend\'s item for a full read-only card with their photos',
      'Installable on your phone, smoother mobile scrolling, and clearer session logging',
    ],
  },
  {
    version: '0.6.0',
    date: 'Aug 2026',
    items: [
      'Friends feed — recent activity, reviews & ratings, filters, and an "in common" view',
      'Add any friend\'s item straight to your own backlog',
      'Profile avatars throughout the app',
      'Games now use IGDB: real completion times (rushed / main / 100%) and box-art covers',
      'Adjustable display size (compact → large) in Settings',
      'Send bug reports & feature ideas from Settings',
    ],
  },
]

const SEEN_KEY = 'hobbylog-seen-version'

// Unseen when the stored version isn't the current one (null → true, so existing
// testers see the notes on rollout). New signups get marked current on onboarding.
export function hasUnseenChangelog(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(SEEN_KEY) !== APP_VERSION
}

export function markChangelogSeen() {
  if (typeof window !== 'undefined') localStorage.setItem(SEEN_KEY, APP_VERSION)
}
