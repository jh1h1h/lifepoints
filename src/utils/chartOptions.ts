import type { ChartOptions } from 'chart.js'

export function chartOptions(
  max: number,
  stacked: boolean,
): ChartOptions<'bar'> {
  return {
    responsive: true,
    animation: false,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest', intersect: true },
    scales: {
      x: { stacked, ticks: { maxRotation: 0, autoSkip: true } },
      y: { stacked, min: 0, max, ticks: { stepSize: max === 100 ? 25 : 5 } },
    },
    plugins: {
      legend: { display: stacked, position: 'bottom' },
      tooltip: {
        callbacks: {
          title: (items) => `Week of ${items[0]?.label ?? ''}`,
          label: (item) => `${item.dataset.label}: ${item.parsed.y ?? 0} / 25`,
        },
      },
    },
  }
}
