import { useMemo, useState } from 'react'
import { ActivityList } from '../components/ActivityList'
import { HistoryCharts } from '../components/HistoryCharts'
import type { Activity } from '../types'
import { getWeekKey } from '../utils/date'
import { buildHistoryRows } from '../utils/history'

interface Props {
  activities: Activity[]
  remove: (id: string) => Promise<void>
  editNote: (id: string, note: string) => Promise<void>
  busy: boolean
  now?: Date
}

export function History({
  activities,
  remove,
  editNote,
  busy,
  now = new Date(),
}: Props) {
  const [range, setRange] = useState<4 | 12 | 'all'>(4)
  const [selectedWeek, setSelectedWeek] = useState<string>('')
  const rows = useMemo(
    () => buildHistoryRows(activities, range, now),
    [activities, range, now],
  )
  const weekKey = rows.some((row) => row.key === selectedWeek)
    ? selectedWeek
    : (rows.at(-1)?.key ?? '')
  const selected = activities.filter(
    (activity) => getWeekKey(new Date(activity.timestamp)) === weekKey,
  )
  return (
    <main className="container page">
      <div className="page-title">
        <p className="eyebrow">Progress over time</p>
        <h1>History</h1>
        <p className="muted">
          Weekly scores reflect each category's 25-point cap. Activities retain
          their original points.
        </p>
      </div>
      <div className="filters range-controls" aria-label="History range">
        {([4, 12, 'all'] as const).map((value) => (
          <button
            key={value}
            className={range === value ? 'selected' : ''}
            aria-pressed={range === value}
            onClick={() => setRange(value)}
          >
            {value === 'all' ? 'All time' : `${value} weeks`}
          </button>
        ))}
      </div>
      {activities.length === 0 && (
        <p className="empty card">
          No history yet. Add an activity to start seeing weekly trends.
        </p>
      )}
      <HistoryCharts rows={rows} />
      <section className="card section-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Records</p>
            <h2>Activities by week</h2>
          </div>
          <select
            aria-label="Select week"
            value={weekKey}
            onChange={(event) => setSelectedWeek(event.target.value)}
          >
            {rows
              .slice()
              .reverse()
              .map((row) => (
                <option value={row.key} key={row.key}>
                  {row.label} ({row.key})
                </option>
              ))}
          </select>
        </div>
        <ActivityList
          activities={selected}
          onDelete={remove}
          onEditNote={editNote}
          busy={busy}
        />
      </section>
    </main>
  )
}
