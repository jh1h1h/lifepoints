import { expect, test, type Page } from '@playwright/test'

async function signIn(page: Page, path = '/docs') {
  await page.goto(path)
  await page.evaluate(async () => {
    const helperPath = '/tests/e2e/auth-helper.ts'
    const helper = await import(/* @vite-ignore */ helperPath)
    await helper.signInTestUser()
  })
}

test('Docs requires Google sign-in outside the emulator test session', async ({
  page,
}) => {
  await page.goto('/docs')
  await expect(
    page.getByRole('button', { name: 'Continue with Google' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'What would you like to remember?' }),
  ).toHaveCount(0)
})

test('creates, edits, renames, and soft-deletes a friend with manual history', async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await signIn(page, '/docs/friends')
  await expect(page.getByRole('heading', { name: 'Friends' })).toBeVisible()
  await page.getByRole('button', { name: 'New friend' }).click()
  const form = page.getByRole('form', { name: 'New friend' })
  await form.getByLabel('Name').fill('Kevin')
  await form.getByLabel('Aliases (comma-separated, optional)').fill('Kev, K')
  await form
    .getByLabel('Document')
    .fill('Employment:\nApple\nHobbies:\nHiking\n')
  await form.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('heading', { name: 'Kevin' })).toBeVisible()
  const entityUrl = page.url()
  await page.reload()
  await expect(page).toHaveURL(entityUrl)
  await expect(page.getByText(/Hobbies:/)).toBeVisible()
  await page.getByRole('button', { name: 'Edit document' }).click()
  await page
    .getByRole('textbox', { name: 'Document' })
    .fill('Employment:\nMicrosoft\nHobbies:\nHiking\n')
  await page.getByLabel('Change type').selectOption('correction')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/Microsoft/)).toBeVisible()
  await page.getByRole('button', { name: 'Rename' }).click()
  await page.getByLabel('Name').fill('Kevin H')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Kevin H' })).toBeVisible()
  await page.getByRole('button', { name: 'View edit history' }).click()
  await expect(page.getByText('Revision 3 · rename')).toBeVisible()
  await expect(page.getByText('− Apple')).toBeVisible()
  await expect(page.getByText('+ Microsoft')).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('heading', { name: 'Friends' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Kevin H' })).toHaveCount(0)
  await page.goto(entityUrl)
  await expect(page.getByText(/history remains available/)).toBeVisible()
  await page.getByRole('button', { name: 'View edit history' }).click()
  await expect(page.getByText('Revision 4 · delete')).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('creates project, protects unsaved edits, and detects stale revisions', async ({
  page,
  context,
}) => {
  await signIn(page, '/docs/projects')
  await page.getByRole('button', { name: 'New project' }).click()
  const form = page.getByRole('form', { name: 'New project' })
  await form.getByLabel('Name').fill('Friendfolio')
  await form.getByLabel('Document').fill('Goals:\nBuild the app')
  await form.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('heading', { name: 'Friendfolio' })).toBeVisible()
  const other = await context.newPage()
  await other.goto(page.url())
  await expect(
    other.getByRole('heading', { name: 'Friendfolio' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Edit document' }).click()
  await page
    .getByRole('textbox', { name: 'Document' })
    .fill('Goals:\nBuild it well')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('link', { name: 'Projects' }).click()
  await expect(page.getByRole('form', { name: 'Edit document' })).toBeVisible()
  await other.getByRole('button', { name: 'Edit document' }).click()
  await other
    .getByRole('textbox', { name: 'Document' })
    .fill('Goals:\nBuild it elsewhere')
  await other.getByRole('button', { name: 'Save' }).click()
  await expect(other.getByText(/elsewhere/)).toBeVisible()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('alert')).toContainText('changed elsewhere')
  await page.getByRole('button', { name: 'Reload latest' }).click()
  await expect(page.getByText(/elsewhere/)).toBeVisible()
  await other.close()
})

test('Points and Docs navigation remains usable at mobile and desktop widths', async ({
  page,
}) => {
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await signIn(page, '/points')
    await expect(page.getByLabel('Weekly score 0 out of 100')).toBeVisible()
    await page.getByRole('link', { name: 'Docs', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'What would you like to remember?' }),
    ).toBeVisible()
    await expect(page.getByLabel('Message')).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await page.getByRole('link', { name: 'Friends' }).click()
    await expect(page.getByRole('button', { name: 'New friend' })).toBeVisible()
    if (width !== 768) {
      await page.screenshot({
        path: `test-results/docs-${width}.png`,
        fullPage: true,
      })
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await page.getByRole('link', { name: 'Points' }).click()
    await expect(page.getByLabel('Weekly score 0 out of 100')).toBeVisible()
  }
})
