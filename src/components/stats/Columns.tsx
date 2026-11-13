'use client'

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { usePrefersReducedMotion } from '@/lib/chartColors'

export interface ColumnDatum {
  label: string      // on the axis
  longLabel: string  // in the tooltip
  value: number
}

// One series as columns over an ordered axis (months, years, rating steps).
// A single series, so there is no legend: the card's title names what is drawn.
// Columns are capped at 24px with the data end rounded and the baseline square,
// the grid is a quiet solid hairline, the tallest column carries its value, and
// every column gives its figure on hover or keyboard focus.
export default function Columns({ data, color, noun, format = (n) => n.toLocaleString(), wholeNumbers = true, height = 210 }: {
  data: ColumnDatum[]
  color: string
  /** What one unit is, for the tooltip: "finished", "added", "hours". */
  noun: string
  format?: (n: number) => string
  wholeNumbers?: boolean
  height?: number
}) {
  const reduced = usePrefersReducedMotion()
  const peakAt = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0)
  // Only the tallest column gets a `peak` field, so only it draws a label.
  const rows = data.map((d, i) => (i === peakAt && d.value > 0 ? { ...d, peak: format(d.value) } : d))

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 22, right: 4, bottom: 0, left: 0 }} accessibilityLayer barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="var(--border-dim)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border-dim)' }} interval="preserveStartEnd" minTickGap={10} tickMargin={6} />
          <YAxis allowDecimals={!wholeNumbers} tickLine={false} axisLine={false} width={34} tickFormatter={(v: number) => format(v)} />
          <Tooltip
            cursor={{ fill: 'color-mix(in srgb, var(--text-hi) 7%, transparent)' }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const d = active && payload && payload[0] ? (payload[0].payload as ColumnDatum) : null
              if (!d) return null
              return (
                <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-dim)', padding: '8px 10px', fontFamily: 'var(--font-body)' }}>
                  {/* The value leads; the reader already knows the series. */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span aria-hidden="true" style={{ width: 12, height: 3, background: color, alignSelf: 'center' }} />
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-hi)' }}>{format(d.value)}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-mid)' }}>{noun}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 2 }}>{d.longLabel}</div>
                </div>
              )
            }}
          />
          <Bar dataKey="value" fill={color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={!reduced}>
            {/* One direct label, on the tallest column. The axis, the tooltip and
                the table carry the rest; a number on every column goes unread. */}
            <LabelList dataKey="peak" position="top" offset={7}
              style={{ fill: 'var(--text-hi)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
