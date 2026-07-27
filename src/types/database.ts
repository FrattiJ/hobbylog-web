export type HobbyCategory = 'games' | 'movies' | 'tv' | 'books' | 'gundams' | 'fitness' | 'art'
export type EntryStatus = 'backlog' | 'in_progress' | 'completed' | 'dropped'
export type BookSubtype = 'book' | 'audiobook' | 'manga' | 'comic' | 'webtoon' | 'light_novel'

export interface Profile {
  id: string
  username: string
  avatar_url: string | null
  bio: string | null
  enabled_hobbies: HobbyCategory[] | null
  created_at: string
}

export interface Entry {
  id: string
  hobby_category: HobbyCategory
  title: string
  status: EntryStatus
  rating: number | null
  notes: string | null
  progress_current: number
  progress_total: number | null
  cover_url: string | null
  external_id: string | null
  external_source: string | null
  metadata: Record<string, unknown>
  book_subtype: BookSubtype | null
  current_season: number | null
  current_episode: number | null
  priority: number | null
  date_started: string | null
  date_completed: string | null
  created_at: string
  updated_at: string
}

export interface Session {
  id: string
  entry_id: string
  date: string
  duration_minutes: number | null
  progress_logged: number | null
  notes: string | null
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Omit<Profile, 'created_at'>; Update: Partial<Omit<Profile, 'id' | 'created_at'>> }
      entries: { Row: Entry; Insert: Omit<Entry, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Entry, 'id' | 'created_at' | 'updated_at'>> }
      sessions: { Row: Session; Insert: Omit<Session, 'id' | 'created_at'>; Update: Partial<Omit<Session, 'id' | 'created_at'>> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
