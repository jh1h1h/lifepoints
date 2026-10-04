import { Chart } from 'chart.js'

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
} {
  const canvas = document.querySelector<HTMLCanvasElement>(
    'canvas[aria-label="Stacked weekly scores from zero to 100"]',
  )
  if (!canvas) throw new Error('Overall chart is missing')
  const growth = document.querySelector<HTMLCanvasElement>(
    'canvas[aria-label="Growth weekly scores from zero to 25"]',
  )
  const people = document.querySelector<HTMLCanvasElement>(
    'canvas[aria-label="People weekly scores from zero to 25"]',
  )
  if (!growth || !people) throw new Error('Category chart is missing')
  return {
    stackedGrowth: isPattern(canvas, 0),
    stackedPeople: isPattern(canvas, 1),
    categoryGrowth: isPattern(growth, 0),
    categoryPeople: isPattern(people, 0),
  }
}
