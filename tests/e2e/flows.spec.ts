import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { TEMPLATE_SEED } from '../../src/data/taskSeeds'

const growthTask = TEMPLATE_SEED.filter(
  (task) => task.category === 'growth' && task.points < 25,
).sort((a, b) => b.points - a.points)[0]
if (!growthTask)
  throw new Error('Browser tests require a Growth task below 25 points')
const taskButtonName = `Add ${growthTask.name}, ${growthTask.points} points in Growth`

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.evaluate(async () => {
    const path = '/tests/e2e/auth-helper.ts'
    const helper = await import(/* @vite-ignore */ path)
    await helper.signInTestUser()
  })
  await expect(
    page.getByRole('button', {
      name: taskButtonName,
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
  await page.getByRole('button', { name: taskButtonName }).click()
  await expect(
    page.getByLabel(`Weekly score ${growthTask.points} out of 100`),
  ).toBeVisible()
  await expect(
    page.getByRole('progressbar', { name: 'Growth score' }),
  ).toHaveAttribute('aria-valuenow', String(growthTask.points))
  await page.reload()
  await expect(
    page.getByLabel(`Weekly score ${growthTask.points} out of 100`),
  ).toBeVisible()
  expect(errors).toEqual([])
})

test('seeds the preserved personal list only for the specified account', async ({
  page,
}) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const path = '/tests/e2e/auth-helper.ts'
    const helper = await import(/* @vite-ignore */ path)
    await helper.signInPersonalSeedUser()
  })
  await expect(
    page.getByRole('button', { name: 'Add Go to work, 5 points in Growth' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: taskButtonName })).toHaveCount(
    0,
  )
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Add Go to work, 5 points in Growth' }),
  ).toBeVisible()
})

test('task note saves and edits without awarding points', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 })
  await signIn(page)
  await page
    .getByRole('button', { name: `Add note for ${growthTask.name}` })
    .click()
  const dialog = page.getByRole('dialog', {
    name: `Note for ${growthTask.name}`,
  })
  await dialog.getByLabel('Task note').fill('Remember the useful part')
  await dialog.getByRole('button', { name: 'Save note' }).click()
  await expect(page.locator('.task-note-text')).toHaveText(
    'Remember the useful part',
  )
  await expect(dialog).toBeHidden()
  await expect(page.getByLabel('Weekly score 0 out of 100')).toBeVisible()
  await expect(page.locator('.activity-row')).toHaveCount(0)
  await page.screenshot({
    path: 'test-results/task-note-375.png',
    fullPage: true,
  })
  const secondPage = await page.context().newPage()
  await secondPage.goto('/')
  await expect(secondPage.locator('.task-note-text')).toHaveText(
    'Remember the useful part',
  )
  await page.reload()
  await expect(page.locator('.task-note-text')).toHaveText(
    'Remember the useful part',
  )
  await page
    .getByRole('button', { name: `Edit note for ${growthTask.name}` })
    .click()
  await dialog.getByLabel('Task note').fill('Updated reminder')
  await dialog.getByRole('button', { name: 'Save note' }).click()
  await expect(page.locator('.task-note-text')).toHaveText('Updated reminder')
  await expect(secondPage.locator('.task-note-text')).toHaveText(
    'Updated reminder',
  )
  await expect(page.getByLabel('Weekly score 0 out of 100')).toBeVisible()
  await secondPage.close()
})

test('creates and deletes a personal task without changing logged history', async ({
  page,
}) => {
  await signIn(page)
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Add task' }).click()
  const form = page.getByRole('form', { name: 'Add task' })
  await form.getByLabel('Task name').fill('Read a new book')
  await form.getByLabel('Category').selectOption('growth')
  await form.getByLabel('Points').fill('2.5')
  await form.getByLabel('Description').fill('Read with focus.')
  await form.getByLabel('Task note').fill('Keep a book nearby')
  await form.getByRole('button', { name: 'Create task' }).click()
  await expect(
    page.getByRole('button', { name: 'Edit Read a new book' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Dashboard' }).click()
  await expect(
    page.getByRole('button', {
      name: 'Add Read a new book, 2.5 points in Growth',
    }),
  ).toBeVisible()
  await expect(page.getByText('Keep a book nearby')).toBeVisible()
  await page
    .getByRole('button', { name: 'Add Read a new book, 2.5 points in Growth' })
    .click()
  await expect(page.getByLabel('Weekly score 2.5 out of 100')).toBeVisible()
  await page.getByRole('button', { name: 'Settings' }).click()
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Delete Read a new book' }).click()
  await expect(
    page.getByRole('button', { name: 'Edit Read a new book' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Dashboard' }).click()
  await expect(
    page.getByRole('button', {
      name: 'Add Read a new book, 2.5 points in Growth',
    }),
  ).toHaveCount(0)
  await expect(
    page.locator('.activity-row').filter({ hasText: 'Read a new book' }),
  ).toContainText('+2.5')
  await expect(page.getByLabel('Weekly score 2.5 out of 100')).toBeVisible()
})

test('does not restore deleted tasks on refresh', async ({ page }) => {
  await signIn(page)
  await page.evaluate(async () => {
    const path = '/tests/e2e/auth-helper.ts'
    const helper = await import(/* @vite-ignore */ path)
    await helper.clearTestTasks()
  })
  await expect(
    page.getByText('No tasks in this category. Add one in Settings.'),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByText('No tasks in this category. Add one in Settings.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: taskButtonName })).toHaveCount(
    0,
  )
})

test('caps raw activities and marks both progress bar and chart', async ({
  page,
}) => {
  await signIn(page)
  const count = Math.floor(25 / growthTask.points) + 1
  for (let index = 0; index < count; index++)
    await page.getByRole('button', { name: taskButtonName }).click()
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
  await expect(page.locator('.activity-row')).toHaveCount(count)
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
  await page.getByRole('button', { name: taskButtonName }).click()
  await page.getByRole('button', { name: taskButtonName }).click()
  await expect(
    page.getByLabel(`Weekly score ${growthTask.points * 2} out of 100`),
  ).toBeVisible()
  await page
    .locator('.activity-row')
    .first()
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(
    page.getByLabel(`Weekly score ${growthTask.points} out of 100`),
  ).toBeVisible()
  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.getByText(`: ${growthTask.points} / 100`)).toBeVisible()
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
  await page.getByRole('button', { name: taskButtonName }).click()
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: `Edit ${growthTask.name}` }).click()
  const form = page.getByRole('form', { name: 'Edit task' })
  await form.getByLabel('Task name').fill('Deep learning session')
  await form.getByLabel('Points').fill(String(growthTask.points + 3))
  await form.getByRole('button', { name: 'Save task' }).click()
  await page.getByRole('button', { name: 'Dashboard' }).click()
  const updatedName = `Add Deep learning session, ${growthTask.points + 3} points in Growth`
  await expect(page.getByRole('button', { name: updatedName })).toBeVisible()
  await expect(
    page.locator('.activity-row').filter({ hasText: growthTask.name }),
  ).toContainText(`+${growthTask.points}`)
  await page.getByRole('button', { name: updatedName }).click()
  await expect(
    page.locator('.activity-row').filter({ hasText: 'Deep learning session' }),
  ).toContainText(`+${growthTask.points + 3}`)
})

test('exports and imports activities', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: taskButtonName }).click()
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
    tasks: unknown[]
  }
  expect(backup.version).toBe(2)
  expect(backup.exportedAt).toBeTruthy()
  expect(backup.activities).toHaveLength(1)
  expect(backup.tasks).toHaveLength(TEMPLATE_SEED.length)
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
  await page.getByRole('button', { name: `Edit ${growthTask.name}` }).click()
  const taskForm = page.getByRole('form', { name: 'Edit task' })
  await taskForm.getByLabel('Task name').fill('Changed after export')
  await taskForm.getByRole('button', { name: 'Save task' }).click()
  await expect(
    page.getByRole('button', { name: 'Edit Changed after export' }),
  ).toBeVisible()
  await page
    .getByLabel('Replace matching tasks with versions from the backup')
    .check()
  await page.getByLabel('Choose backup JSON').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  })
  await expect(
    page.getByRole('button', { name: `Edit ${growthTask.name}` }),
  ).toBeVisible()
})

test('keeps loaded data readable and explains offline writes', async ({
  page,
}) => {
  await signIn(page)
  await page.getByRole('button', { name: taskButtonName }).click()
  await expect(
    page.getByLabel(`Weekly score ${growthTask.points} out of 100`),
  ).toBeVisible()
  await expect(
    page.getByRole('button', {
      name: taskButtonName,
    }),
  ).toBeEnabled()
  await page.context().setOffline(true)
  await page.getByRole('button', { name: taskButtonName }).click()
  await expect(page.getByText(/You appear to be offline/)).toBeVisible()
  await expect(
    page.getByLabel(`Weekly score ${growthTask.points} out of 100`),
  ).toBeVisible()
})

for (const width of [375, 768, 1280])
  test(`layout is usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await signIn(page)
    await expect(
      page.getByRole('button', {
        name: taskButtonName,
      }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'History' })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
    const box = await page
      .getByRole('button', { name: taskButtonName })
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
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('button', { name: 'Add task' })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
    await page.screenshot({
      path: `test-results/settings-${width}.png`,
      fullPage: true,
    })
  })
