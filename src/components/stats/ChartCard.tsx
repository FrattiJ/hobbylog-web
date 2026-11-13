'use client'

import { Panel } from '@/components/suggestions/ui'

export interface TableView {
  columns: string[]
  rows: Array<Array<string | number>>
}

// The frame every chart on the Stats page sits in: a title that says what is
// plotted, one line on how to read it, the chart, and the same numbers as a
// table for anyone who cannot or would rather not read them off the marks.
export default function ChartCard({ title, sub, accent, table, children }: {
  title: string
  sub?: string
  accent: string
  table?: TableView
  children: React.ReactNode
}) {
  return (
    <Panel accent={accent} title={title} sub={sub} style={{ minWidth: 0 }}>
      {children}
      {table && table.rows.length > 0 && (
        <details className="chart-table">
          <summary>View as table</summary>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>{table.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Panel>
  )
}

/** What a chart area shows when there is nothing to plot: the reason, and what would change that. */
export function ChartEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.55, color: 'var(--text-dim)', margin: 0, padding: '28px 8px', textAlign: 'center' }}>
      {children}
    </p>
  )
}
