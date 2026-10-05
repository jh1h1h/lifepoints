import type { ChartOptions } from 'chart.js'

export function chartOptions(
  max: number,
  stacked: boolean,
): ChartOptions<'bar'> {
  return {
    responsive: true,
    animation: false,
    maintainAspectRatio: false,
    layout: { padding: { top: 6, bottom: 4 } },
    interaction: { mode: 'nearest', intersect: true },
    scales: {
      x: {
        stacked,
        grid: { display: false },
        border: { display: false },
        ticks: { maxRotation: 0, autoSkip: true, color: '#607168' },
      },
      y: {
        stacked,
        min: 0,
        max,
        border: { display: false, dash: [4, 4] },
        grid: { color: '#e6ece6', tickLength: 0 },
        ticks: {
          stepSize: max === 100 ? 25 : 5,
          color: '#607168',
          padding: 8,
        },
      },
    },
    plugins: {
      legend: {
        display: stacked,
        position: 'bottom',
        labels: {
          usePointStyle: true,
          pointStyle: 'rectRounded',
          boxWidth: 11,
          boxHeight: 11,
          padding: 16,
          color: '#40574b',
        },
      },
      tooltip: {
        backgroundColor: '#263f34',
        cornerRadius: 10,
        padding: 11,
        callbacks: {
          title: (items) => `Week of ${items[0]?.label ?? ''}`,
          label: (item) => `${item.dataset.label}: ${item.parsed.y ?? 0} / 25`,
        },
      },
    },
  }
}
