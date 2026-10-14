import { expect, test, type Page } from '@playwright/test'
async function signIn(page: Page, path = '/docs') {
  await page.goto(path)
  await page.evaluate(async () => {
    const helperPath = '/tests/e2e/auth-helper.ts'
    const helper = await import(/* @vite-ignore */ helperPath)
    await helper.signInTestUser()
  })
}
test('creates and edits sections with friend unread state', async ({
  page,
}) => {
  await signIn(page, '/docs/friends')
  await page.getByRole('button', { name: 'New friend' }).click()
  const form = page.getByRole('form', { name: 'New friend' })
  await form.getByLabel('Name').fill('Henry')
  await form.getByLabel('First section (optional)').fill('Henry goes to Yale')
  await form.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('heading', { name: 'Henry' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Unread' })).toBeChecked()
  await page.getByRole('button', { name: 'Pin' }).click()
  await expect(page.getByRole('button', { name: 'Unpin' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Unread' }).click()
  await expect(page.getByRole('checkbox', { name: 'Unread' })).not.toBeChecked()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.locator('.section-card textarea').fill('Henry goes to Harvard')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Henry goes to Harvard')).toBeVisible()
})
test('shows recent project sections beside chat', async ({ page }) => {
  await signIn(page, '/docs/projects')
  await page.getByRole('button', { name: 'New project' }).click()
  const form = page.getByRole('form', { name: 'New project' })
  await form.getByLabel('Name').fill('Friendfolio')
  await form.getByLabel('First section (optional)').fill('Ship the prototype')
  await form.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('link', { name: 'Chat' }).click()
  await expect(
    page
      .getByRole('complementary', { name: 'Recent project sections' })
      .getByText('Ship the prototype'),
  ).toBeVisible()
})
test('Docs remains usable at mobile and desktop widths', async ({ page }) => {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await signIn(page)
    await expect(page.getByLabel('Message')).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  }
})
