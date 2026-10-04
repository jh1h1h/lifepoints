import { useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js'
import {
  CATEGORIES,
  CATEGORY_NAMES,
  CATEGORY_COLORS,
  type Category,
} from '../types'
import {
  CATEGORY_AXIS_MAX,
  chartFill,
  OVERALL_AXIS_MAX,
  type WeekChartRow,
} from '../utils/history'
import { chartOptions } from '../utils/chartOptions'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

export function HistoryCharts({ rows }: { rows: WeekChartRow[] }) {
  const stacked = useMemo(
    () => ({
      labels: rows.map((row) => row.label.split(' – ')[0]),
      datasets: CATEGORIES.map((category) => ({
        label: CATEGORY_NAMES[category],
        data: rows.map((row) => row.categories[category].value),
        backgroundColor: (context: { chart: ChartJS; dataIndex: number }) => {
          const canvas = context.chart.ctx
          return chartFill(
            canvas,
            category,
            rows[context.dataIndex]?.categories[category].isCapped ?? false,
          )
        },
        borderColor: CATEGORY_COLORS[category],
        borderWidth: 1,
        borderSkipped: false,
      })),
    }),
    [rows],
  )
  return (
    <>
      <section className="card chart-card">
        <h2>Weekly total</h2>
        <p className="muted">
          Each bar shows up to 100 points. Striped = weekly category cap
          reached.
        </p>
        <div className="chart-wrap">
          <Bar
            data={stacked}
            options={chartOptions(OVERALL_AXIS_MAX, true)}
            aria-label="Stacked weekly scores from zero to 100"
            role="img"
          />
        </div>
        <div className="chart-summary">
          <h3>Weekly values</h3>
          <ul>
            {rows.map((row) => (
              <li key={row.key}>
                {row.label}: {row.total} / 100 ·{' '}
                {CATEGORIES.map(
                  (category) =>
                    `${CATEGORY_NAMES[category]} ${row.categories[category].value}${row.categories[category].isCapped ? ' capped' : ''}`,
                ).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <div className="category-charts">
        {CATEGORIES.map((category) => (
          <CategoryChart key={category} rows={rows} category={category} />
        ))}
      </div>
    </>
  )
}

function CategoryChart({
  rows,
  category,
}: {
  rows: WeekChartRow[]
  category: Category
}) {
  const labels = rows.map((row) => row.label.split(' – ')[0])
  const data = {
    labels,
    datasets: [
      {
        label: CATEGORY_NAMES[category],
        data: rows.map((row) => row.categories[category].value),
        backgroundColor: (context: { chart: ChartJS; dataIndex: number }) =>
          chartFill(
            context.chart.ctx,
            category,
            rows[context.dataIndex]?.categories[category].isCapped ?? false,
          ),
        borderColor: CATEGORY_COLORS[category],
        borderWidth: 1,
        borderSkipped: false,
      },
    ],
  }
  return (
    <section className="card chart-card">
      <h2>{CATEGORY_NAMES[category]}</h2>
      <div className="chart-wrap small">
        <Bar
          data={data}
          options={chartOptions(CATEGORY_AXIS_MAX, false)}
          aria-label={`${CATEGORY_NAMES[category]} weekly scores from zero to 25`}
          role="img"
        />
      </div>
      <p className="chart-summary">
        {rows.filter((row) => row.categories[category].isCapped).length} capped{' '}
        {rows.filter((row) => row.categories[category].isCapped).length === 1
          ? 'week'
          : 'weeks'}{' '}
        · Striped = 25 / 25
      </p>
    </section>
  )
}
