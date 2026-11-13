// Bump APP_VERSION and add an entry when shipping tester-visible changes — the
// "What's New" popup fires for anyone whose last-seen version is older.
export const APP_VERSION = '0.11.0'

// A release's headline changes, walked through one at a time before the full
// list. Each step pairs a short claim with a miniature of the page it is about;
// `preview` names one of the miniatures in components/WhatsNew.tsx. Keep it to
// three or four steps: this is the part people actually read. The last step's
// button takes them to `cta.href`, so end on the page most worth opening.
export type TourPreview = 'covers' | 'stats' | 'shelf'
export interface TourStep { title: string; body: string; preview: TourPreview; previewLabel: string }
export interface Tour { steps: TourStep[]; cta: { label: string; href: string } }

export interface ChangelogEntry { version: string; date: string; items: string[]; tour?: Tour }

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.11.0',
    date: 'Nov 2026',
    tour: {
      steps: [
        {
          title: 'Your library, by cover.',
          body: 'Hobby pages open as a wall of cover art, and every status tab shows how many entries it holds. The compact list is one toggle away.',
          preview: 'covers',
          previewLabel: 'A games library drawn as a grid of covers, with tabs for wishlist, backlog, in progress and completed.',
        },
        {
          title: 'Stats that follow time.',
          body: 'See what you finished and added each month, whether the pile grew or shrank, and how many months of backlog you have at your own pace.',
          preview: 'stats',
          previewLabel: 'A chart of entries finished and added over six months, above three figures: months of backlog, finish rate and typical days to finish.',
        },
        {
          title: 'A Shelf for what you finished.',
          body: 'Everything you have completed, grouped by year with your ratings. Finish dates can be edited now, so older entries land in the right year.',
          preview: 'shelf',
          previewLabel: 'A shelf for 2026 showing four finished entries with their ratings and finish dates.',
        },
      ],
      cta: { label: 'Open your Shelf', href: '/shelf' },
    },
    items: [
      'A cleaner, easier-to-read look: a new typeface for everything you read, larger text and plainer wording throughout',
      'Your library as covers: hobby pages open as a wall of cover art, with a toggle back to the compact list',
      'New Shelf page: everything you have finished, grouped by year, with your ratings',
      'Wishlist: a new status for games, books and projects you do not have yet. They stay out of your backlog ranking and What Next until you move them',
      'Status tabs now show how many entries each one holds',
      'Pinch-to-zoom works on phones, keyboard focus is visible everywhere, and reduced-motion settings are respected',
      'A new front page for visitors who are not signed in',
      'What Next and Fitness are laid out for both phones and wide screens: suggestion cards two across, larger tabs, compact set grids',
      'Filters, tabs and sort order are part of the page address, so a view can be bookmarked, shared or reloaded',
      'Deleting asks in a proper dialog that says what goes with it, including sessions, photos, friends and goals that used to vanish at once',
      'Big libraries open faster: entries load in batches as you scroll',
      'The light theme now has readable accent colors',
      'Dates you can set: every entry shows when it was added, started and finished, and all three can be edited. Set them when adding something you finished earlier',
      'Missing finish dates can be filled in for many entries at once: on a hobby page choose Completed, then Select, then Set Finish Date. You can also sort by finish date',
      'Stats is rebuilt around time: what you finished and added each month, whether the pile grew or shrank, hours logged and which hobby they went to, with a period you choose',
      'New library figures: months of backlog at your pace, typical days to finish, finish rate, the spread of your ratings, and what has waited longest',
      'The dashboard leads with what you are in the middle of, then the month so far, and shows what you finished most recently',
      'Entry pages show how many other people track the same title, how many finished it and how they rated it',
      'What\'s New opens as a short tour of the headline changes, with the full list one click away',
      'Password fields have a show button, and creating an account spells out what other people can and cannot see',
    ],
  },
  {
    version: '0.10.1',
    date: 'Nov 2026',
    items: [
      'New hobby: Cooking. Save recipes with ingredients, steps, a rating and notes for next time, plus optional difficulty and time to cook',
      'Tag recipes as breakfast, lunch, dinner, entree, dessert and more, then filter by tag',
      'Tick off ingredients and steps as you cook, and log each time you make a recipe',
      'Turn Cooking on under Settings, Tracked Hobbies',
      'Forgot your password? The sign-in screen can now email you a link to choose a new one',
      'Change your password any time from Settings, under Account',
    ],
  },
  {
    version: '0.10.0',
    date: 'Oct 2026',
    items: [
      'New "What Next" page — suggestions built entirely from your own library, with the reasoning shown',
      'Next Up picks from your backlog: your ranking still leads, but it gets corrected for what you actually finish',
      'Finish or Drop calls out anything you started and abandoned, with a verdict and the hours left',
      'Discover suggests new titles — rationed against how buried your backlog already is, so it never just piles more on',
      'The engine learns your length tolerance: if you finish short games and bail on 80-hour ones, it stops suggesting 80-hour ones',
      'Genres now come down from every catalog (films, TV, books, manga), plus whether a show has actually ended',
      'Every suggestion says why — genre affinity, your finish rate at that length, and your own pace in hours per week',
      'Idle-since dates for Steam games now come from Steam itself, so a sync no longer makes an abandoned game look freshly played',
      'Housekeeping writes (genre backfill, time-to-beat lookups, Steam appid linking) no longer count as activity on an entry',
    ],
  },
  {
    version: '0.9.0',
    date: 'Sep 2026',
    items: [
      "Export everything to a spreadsheet — pick your hobbies, get an Excel workbook with a sheet each, or CSVs",
      "Browse everyone on Hobbylog instead of having to know someone's exact username first",
      "Take back a friend request you sent by mistake",
      "Much lighter on your phone's battery — opening a page used to fire dozens of needless requests",
      "Fitness: a routine's target sets and reps now show when you load it, instead of an empty grid",
      "Fitness: rename, re-measure or remove exercises — custom ones used to be write-once",
      "Fitness: log your bodyweight whenever you actually weigh yourself — first thing in the morning, on a rest day — instead of only while finishing a workout, and see it charted over time",
      "Fitness: set a goal bodyweight — going up or coming down — and it completes itself the moment you log a weigh-in that reaches it",
      "Fitness: edit a logged workout — fix a wrong date, duration, set or note without deleting the session",
      "Fitness: Progress now totals the volume you have lifted and the time you have trained, in place of two stats the heatmap already showed",
      "Fitness: the progress picker lists only lifts you've actually logged",
      "Fitness: goals can name any exercise in the catalog, not just ones you've already done",
      "Fitness: the consistency heatmap opens on today, and the scrollbars are gone from it and the tab bar",
    ],
  },
  {
    version: '0.8.0',
    date: 'Aug 2026',
    items: [
      'Fitness is now a real workout tracker — build routines, log every set, chase records',
      'Build routines from a built-in catalog of 873 exercises, or type in your own',
      'Exercises track what actually fits them: weight × reps, reps, a timed hold, or time + distance for runs',
      'Last session\'s numbers show up as you log, so you always know what to beat',
      'Setup notes per exercise — seat position, incline, grip — carried forward until you change them',
      'Personal records tracked automatically — heaviest lift, estimated 1RM, best pace, longest hold',
      'Progress charts per exercise, plus a consistency heatmap and workout streaks',
      'Schedule routines to a weekday — one loads itself on the Today tab, and if two share a day you pick which',
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
