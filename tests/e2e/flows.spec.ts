import { expect, test } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.evaluate(async () => {
    const path = '/tests/e2e/auth-helper.ts'
    const helper = await import(/* @vite-ignore */ path)
    await helper.signInTestUser()
  })
  await expect(
    page.getByRole('button', {
      name: /Add Focused learning session, 5 points/,
    }),
  ).toBeVisible()
}

test('adds an activity and persists through refresh', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await signIn(page)
  await page
    .getByRole('button', { name: /Add Focused learning session, 5 points/ })
    .click()
  await expect(page.getByLabel('Weekly score 5 out of 100')).toBeVisible()
  await expect(
    page.getByRole('progressbar', { name: 'Growth score' }),
  ).toHaveAttribute('aria-valuenow', '5')
  await page.reload()
  await expect(page.getByLabel('Weekly score 5 out of 100')).toBeVisible()
  expect(errors).toEqual([])
})

test('caps raw activities and marks both progress bar and chart', async ({
  page,
}) => {
  await signIn(page)
  for (let index = 0; index < 6; index++)
    await page
      .getByRole('button', { name: /Add Focused learning session, 5 points/ })
      .click()
  await expect(page.getByLabel('Weekly score 25 out of 100')).toBeVisible()
  await expect(
    page.getByRole('progressbar', { name: 'Growth score' }),
  ).toHaveAttribute('aria-valuenow', '25')
  await expect(page.getByText('Cap reached · striped')).toBeVisible()
  expect(
    await page
      .getByRole('progressbar', { name: 'Growth score' })
      .evaluate(
        (element) =>
          getComputedStyle(element.firstElementChild!).backgroundImage,
      ),
  ).toContain('repeating-linear-gradient')
  await expect(page.locator('.activity-row')).toHaveCount(6)
  await page.getByRole('button', { name: 'History' }).click()
  await expect(
    page.locator('.chart-summary li').filter({ hasText: 'Growth 25 capped' }),
  ).toBeVisible()
  await expect(
    page.getByText('1 capped week · Striped = 25 / 25'),
  ).toBeVisible()
  await expect(
    page.getByRole('img', { name: 'Stacked weekly scores from zero to 100' }),
  ).toBeVisible()
  const patterns = await page.evaluate(async () => {
    const path = '/tests/e2e/chart-helper.ts'
    return (await import(/* @vite-ignore */ path)).inspectChartPatterns()
  })
  expect(patterns).toEqual({
    stackedGrowth: true,
    stackedPeople: false,
    categoryGrowth: true,
    categoryPeople: false,
  })
  await page.getByRole('button', { name: 'Dismiss message' }).click()
  await page.screenshot({
    path: 'test-results/history-cap-1280.png',
    fullPage: true,
  })
})

test('deletion updates dashboard and history', async ({ page }) => {
  await signIn(page)
  await page
    .getByRole('button', { name: /Add Focused learning session, 5 points/ })
    .click()
  await page
    .getByRole('button', { name: /Add Focused learning session, 5 points/ })
    .click()
  await expect(page.getByLabel('Weekly score 10 out of 100')).toBeVisible()
  await page
    .locator('.activity-row')
    .first()
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(page.getByLabel('Weekly score 5 out of 100')).toBeVisible()
  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.getByText(/: 5 \/ 100/)).toBeVisible()
})

test('separates current and earlier weeks', async ({ page }) => {
  await signIn(page)
  const now = new Date()
  const earlier = new Date(now)
  earlier.setDate(earlier.getDate() - 7)
  await page.evaluate(
    async (timestamps) => {
      const path = '/tests/e2e/auth-helper.ts'
      const helper = await import(/* @vite-ignore */ path)
      for (const [index, timestamp] of timestamps.entries())
        await helper.seedActivity({
          activityId: `seed-${index}`,
          userId: 'ignored',
          taskId: 'growth_learning',
          taskName: 'Focused learning session',
          taskDescription: 'Learn',
          category: 'growth',
          configuredPoints: 5,
          timestamp,
          note: '',
          createdAt: timestamp,
          updatedAt: timestamp,
        })
    },
    [now.toISOString(), earlier.toISOString()],
  )
  await expect(page.getByLabel('Weekly score 5 out of 100')).toBeVisible()
  await page.getByRole('button', { name: 'History' }).click()
  await expect(
    page.locator('.chart-summary li').filter({ hasText: ': 5 / 100' }),
  ).toHaveCount(2)
  await page.getByRole('button', { name: '12 weeks' }).click()
  await expect(page.locator('.chart-summary li')).toHaveCount(12)
  await page.getByRole('button', { name: 'All time' }).click()
  await expect(page.locator('.chart-summary li')).toHaveCount(2)
})

test('task metadata changes only affect new activities', async ({ page }) => {
  await signIn(page)
  await page
    .getByRole('button', { name: /Add Focused learning session, 5 points/ })
    .click()
  const path = 'src/generated/tasks.json'
  const original = readFileSync(path, 'utf8')
  try {
    const tasks = JSON.parse(original) as {
      id: string
      name: string
      points: number
    }[]
    const task = tasks.find((item) => item.id === 'growth_learning')!
    task.name = 'Deep learning session'
    task.points = 8
    writeFileSync(path, JSON.stringify(tasks, null, 2) + '\n')
    await page.reload()
    await expect(
      page.getByRole('button', { name: /Add Deep learning session, 8 points/ }),
    ).toBeVisible()
    await expect(
      page
        .locator('.activity-row')
        .filter({ hasText: 'Focused learning session' }),
    ).toContainText('+5')
    await page
      .getByRole('button', { name: /Add Deep learning session, 8 points/ })
      .click()
    await expect(
      page
        .locator('.activity-row')
        .filter({ hasText: 'Deep learning session' }),
    ).toContainText('+8')
  } finally {
    writeFileSync(path, original)
  }
})

test('exports and imports activities', async ({ page }) => {
  await signIn(page)
  await page
    .getByRole('button', { name: /Add Focused learning session, 5 points/ })
    .click()
  await page.getByRole('button', { name: 'Settings' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON' }).click()
  const download = await downloadPromise
  const downloadPath = await download.path()
  if (!downloadPath) throw new Error('Download did not produce a file')
  const backup = JSON.parse(readFileSync(downloadPath, 'utf8')) as {
    version: number
    exportedAt: string
    activities: unknown[]
  }
  expect(backup.version).toBe(1)
  expect(backup.exportedAt).toBeTruthy()
  expect(backup.activities).toHaveLength(1)
  await page.evaluate(async () => {
    const path = '/tests/e2e/auth-helper.ts'
    const helper = await import(/* @vite-ignore */ path)
    await helper.clearTestActivities()
  })
  await expect(page.getByText('0 activities in this account.')).toBeVisible()
  await page.getByLabel('Choose backup JSON').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  })
  await expect(page.getByText('1 activities in this account.')).toBeVisible()
  await page.getByLabel('Choose backup JSON').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  })
  await expect(page.getByText('1 activities in this account.')).toBeVisible()
})

test('keeps loaded data readable and explains offline writes', async ({
  page,
}) => {
  await signIn(page)
  await page
    .getByRole('button', { name: /Add Focused learning session, 5 points/ })
    .click()
  await expect(page.getByLabel('Weekly score 5 out of 100')).toBeVisible()
  await expect(
    page.getByRole('button', {
      name: /Add Focused learning session, 5 points/,
    }),
  ).toBeEnabled()
  await page.context().setOffline(true)
  await page
    .getByRole('button', { name: /Add Focused learning session, 5 points/ })
    .click()
  await expect(page.getByText(/You appear to be offline/)).toBeVisible()
  await expect(page.getByLabel('Weekly score 5 out of 100')).toBeVisible()
})

for (const width of [375, 768, 1280])
  test(`layout is usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await signIn(page)
    await expect(
      page.getByRole('button', {
        name: /Add Focused learning session, 5 points/,
      }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'History' })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
    const box = await page
      .getByRole('button', { name: /Add Focused learning session, 5 points/ })
      .boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    await page.screenshot({
      path: `test-results/dashboard-${width}.png`,
      fullPage: true,
    })
    await page.getByRole('button', { name: 'History' }).click()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
  })
