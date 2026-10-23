'use client'

// "What next" — the suggestion engine's page. Everything it shows is derived from
// your own library (see lib/taste.ts); only new-title discovery reaches out, and
// only when you open that tab.
import SuggestionsPage from '@/components/suggestions/SuggestionsPage'

export default function SuggestionsRoute() {
  return <SuggestionsPage />
}
