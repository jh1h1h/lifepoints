import type { ChartOptions } from 'chart.js'

export function formatScoreTooltip(label: string, rawPoints: number): string {
  return `${label}: ${rawPoints} / 25${rawPoints > 25 ? ' (25 counted)' : ''}`
}

export function chartOptions(
  max: number,
  stacked: boolean,
  rawValues?: number[][],
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
          stepSize: stacked ? 25 : max > 50 ? 10 : 5,
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
          label: (item) =>
            formatScoreTooltip(
              item.dataset.label ?? '',
              rawValues?.[item.datasetIndex]?.[item.dataIndex] ??
                item.parsed.y ??
                0,
            ),
        },
      },
    },
  }
}
