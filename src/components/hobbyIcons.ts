import { Gamepad2, Film, Tv, BookOpen, Bot, Dumbbell, Palette } from 'lucide-react'

// Maps HobbyConfig.icon names (src/lib/hobbies.ts) to lucide components.
// Single source of truth — add here when adding a hobby.
export const HOBBY_ICON_MAP: Record<string, React.ComponentType<{ size?: number }>> = {
  Gamepad2, Film, Tv, BookOpen, Bot, Dumbbell, Palette,
}
