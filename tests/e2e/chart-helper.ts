import { Chart, type BarElement } from 'chart.js'

function isPattern(canvas: HTMLCanvasElement, dataset: number): boolean {
  const chart = Chart.getChart(canvas)
  if (!chart) throw new Error('Chart was not initialized')
  const last = chart.data.labels!.length - 1
  return (
    chart.getDatasetMeta(dataset).data[last].options.backgroundColor instanceof
    CanvasPattern
  )
}

export function inspectChartPatterns(): {
  stackedGrowth: boolean
  stackedPeople: boolean
  categoryGrowth: boolean
  categoryPeople: boolean
  stackedNoOutlines: boolean
  stackedGrowthValue: number
  categoryGrowthValue: number
  categoryGrowthAxisMax: number
} {
  const canvas = document.querySelector<HTMLCanvasElement>(
    'canvas[aria-label="Stacked weekly scores from zero to 100"]',
  )
  if (!canvas) throw new Error('Overall chart is missing')
  const growth = document.querySelector<HTMLCanvasElement>(
    'canvas[aria-label="Growth weekly raw points"]',
  )
  const people = document.querySelector<HTMLCanvasElement>(
    'canvas[aria-label="People weekly raw points"]',
  )
  if (!growth || !people) throw new Error('Category chart is missing')
  const stackedChart = Chart.getChart(canvas)
  const growthChart = Chart.getChart(growth)
  if (!stackedChart) throw new Error('Overall chart was not initialized')
  if (!growthChart) throw new Error('Growth chart was not initialized')
  const last = stackedChart.data.labels!.length - 1
  return {
    stackedGrowth: isPattern(canvas, 0),
    stackedPeople: isPattern(canvas, 1),
    categoryGrowth: isPattern(growth, 0),
    categoryPeople: isPattern(people, 0),
    stackedNoOutlines: stackedChart.data.datasets.every(
      (_, index) =>
        stackedChart.getDatasetMeta(index).data[last].options.borderWidth === 0,
    ),
    stackedGrowthValue: Number(stackedChart.data.datasets[0].data[last]),
    categoryGrowthValue: Number(growthChart.data.datasets[0].data[last]),
    categoryGrowthAxisMax: growthChart.scales.y.max,
  }
}

export function stackedGrowthBarCenter(): { x: number; y: number } {
  const canvas = document.querySelector<HTMLCanvasElement>(
    'canvas[aria-label="Stacked weekly scores from zero to 100"]',
  )
  if (!canvas) throw new Error('Overall chart is missing')
  const chart = Chart.getChart(canvas)
  if (!chart) throw new Error('Overall chart was not initialized')
  const bar = chart.getDatasetMeta(0).data[
    chart.data.labels!.length - 1
  ] as BarElement
  const { x, y, base } = bar.getProps(['x', 'y', 'base'], true)
  if (x === null || y === null) throw new Error('Growth bar is not visible')
  const bounds = canvas.getBoundingClientRect()
  return { x: bounds.left + x, y: bounds.top + (y + base) / 2 }
}

export function stackedTooltipText(): string {
  const canvas = document.querySelector<HTMLCanvasElement>(
    'canvas[aria-label="Stacked weekly scores from zero to 100"]',
  )
  if (!canvas) throw new Error('Overall chart is missing')
  const chart = Chart.getChart(canvas)
  if (!chart) throw new Error('Overall chart was not initialized')
  return chart.tooltip?.body.flatMap((item) => item.lines).join(' ') ?? ''
}
