import { expect, test, type Page } from '@playwright/test'
async function signIn(page: Page) {
  await page.goto('/docs')
  await page.evaluate(async () => {
    const helperPath = '/tests/e2e/auth-helper.ts'
    const helper = await import(/* @vite-ignore */ helperPath)
    await helper.signInTestUser()
  })
  await expect(
    page.getByRole('heading', { name: 'What would you like to remember?' }),
  ).toBeVisible()
}
async function ask(page: Page, text: string) {
  await page.getByLabel('Message').fill(text)
  await page.getByRole('button', { name: 'Send' }).click()
}
test('routes and saves the exact statement after approval', async ({
  page,
}) => {
  await signIn(page)
  await ask(page, 'Create Henry')
  await page.getByRole('button', { name: 'Approve section' }).click()
  await expect(page.getByText(/Section saved to/)).toBeVisible()
  await ask(page, 'henry goes to harvard')
  const proposal = page.getByRole('region', { name: 'Suggested note' }).last()
  await expect(proposal.getByText('henry goes to harvard')).toBeVisible()
  await proposal.getByRole('button', { name: 'Approve section' }).click()
  await expect(page.getByText(/Section saved to/).last()).toBeVisible()
})
test('answers a query from current sections', async ({ page }) => {
  await signIn(page)
  await ask(page, 'Create Henry')
  await page.getByRole('button', { name: 'Approve section' }).click()
  await ask(page, 'henry goes to harvard')
  await page.getByRole('button', { name: 'Approve section' }).last().click()
  await ask(page, 'Where does Henry go to school?')
  await expect(page.getByText('Henry goes to Harvard.')).toBeVisible()
})
test('chat stays in memory only', async ({ page }) => {
  await signIn(page)
  await ask(page, 'Create Henry')
  await expect(
    page.getByRole('log', { name: 'Conversation' }).getByText('Create Henry'),
  ).toBeVisible()
  await page.reload()
  await expect(page.getByText('Create Henry')).toHaveCount(0)
})
