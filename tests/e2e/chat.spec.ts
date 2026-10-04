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

async function ask(page: Page, message: string) {
  await page.getByRole('textbox', { name: 'Message' }).fill(message)
  await page.getByRole('button', { name: 'Send' }).click()
}

test('explains rejected model output and exposes the raw response only when expanded', async ({
  page,
}) => {
  await signIn(page)
  await ask(page, 'Diagnostic invalid action')
  await expect(page.getByRole('alert')).toContainText('required action format')
  const details = page.getByText('Show error details')
  await expect(details).toBeVisible()
  await details.click()
  await expect(page.getByText(/"action":"execute"/)).toBeVisible()
  await expect(page.getByText(/DeepSeek response ID:/)).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Approve change' }),
  ).toHaveCount(0)
})

test('chat suggestions require approval and support current, historical, and manual document workflows', async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await signIn(page)
  await ask(page, 'Create Kevin')
  await expect(
    page.getByRole('heading', { name: 'Friend: Kevin' }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('region', { name: 'create proposal for Kevin' })
      .getByText('Pending approval'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Approve change' }).click()
  await expect(page.getByText(/Saved Kevin, revision 1/)).toBeVisible()

  await ask(page, 'Kevin is working at Microsoft')
  await expect(
    page
      .getByRole('region', { name: 'add proposal for Kevin' })
      .getByText(/Working at Microsoft/),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Approve change' }).last().click()
  await expect(page.getByText(/Saved Kevin, revision 2/)).toBeVisible()

  await ask(page, 'Kevin is now working at Apple')
  await expect(page.getByText(/Working at Microsoft/).last()).toBeVisible()
  await page.getByRole('button', { name: 'Approve change' }).last().click()
  await expect(page.getByText(/Saved Kevin, revision 3/)).toBeVisible()

  await ask(page, 'Where does Kevin work?')
  await expect(page.getByText('Kevin currently works at Apple.')).toBeVisible()
  await ask(page, 'Where did Kevin work previously?')
  await expect(page.getByText(/Enable full history/).last()).toBeVisible()
  await page.getByRole('checkbox', { name: 'Include full history' }).check()
  await ask(page, 'Where did Kevin work previously?')
  await expect(
    page.getByText('Kevin previously worked at Microsoft.'),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Kevin · edit history' }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Open document' }).last().click()
  await expect(page.getByRole('heading', { name: 'Kevin' })).toBeVisible()
  await page.getByRole('button', { name: 'Edit document' }).click()
  await page
    .getByRole('textbox', { name: 'Document' })
    .fill('Employment:\nWorking at Apple\nHobbies:\nHiking')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(
    page
      .getByRole('status', { name: '' })
      .filter({ hasText: 'Document saved.' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'View edit history' }).click()
  await expect(page.getByText('Revision 4 · update content')).toBeVisible()
  await expect(page.getByText(/manual · unspecified/i).last()).toBeVisible()
  await page.getByRole('link', { name: 'Chat' }).click()

  await ask(page, 'Remove hiking from Kevin')
  await expect(page.getByText('Remove only this text')).toBeVisible()
  await page.getByRole('button', { name: 'Approve change' }).last().click()
  await expect(page.getByText(/Saved Kevin, revision 5/)).toBeVisible()

  await ask(page, 'Kevin changed jobs')
  await expect(
    page.getByText(/Changed jobs; current employer unknown/),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Reject' }).last().click()
  await expect(
    page.getByText('Rejected. No document was changed.'),
  ).toBeVisible()

  await ask(page, 'Create Friendfolio')
  await expect(
    page.getByRole('heading', { name: 'Project: Friendfolio' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Approve change' }).last().click()
  await expect(page.getByText(/Saved Friendfolio, revision 1/)).toBeVisible()
  await ask(page, 'Complete AI integration for Friendfolio')
  await expect(
    page
      .getByRole('region', { name: 'add proposal for Friendfolio' })
      .getByText(/Complete AI integration/),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Approve change' }).last().click()
  await expect(page.getByText(/Saved Friendfolio, revision 2/)).toBeVisible()

  await page.getByRole('link', { name: 'Points', exact: true }).click()
  await expect(page.getByLabel(/Weekly score/)).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('clarifies duplicate names and keeps the chat usable at mobile, tablet, and desktop widths', async ({
  page,
}) => {
  await signIn(page)
  await page.getByRole('link', { name: 'Friends' }).click()
  for (const alias of ['Tan', 'Lim']) {
    await page.getByRole('button', { name: 'New friend' }).click()
    const form = page.getByRole('form', { name: 'New friend' })
    await form.getByLabel('Name').fill('Kevin')
    await form
      .getByLabel('Aliases (comma-separated, optional)')
      .fill(`Kevin ${alias}`)
    await form.getByLabel('Document').fill('Employment:\nWorking at Apple')
    await form.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByRole('heading', { name: 'Kevin' })).toBeVisible()
    await page.getByRole('link', { name: 'Friends' }).click()
  }
  await page.getByRole('link', { name: 'Chat' }).click()
  await ask(page, 'Kevin changed jobs')
  await expect(page.getByText('Which document do you mean?')).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Kevin · friend/ }),
  ).toHaveCount(2)
  await page
    .getByRole('button', { name: /Kevin · friend/ })
    .first()
    .click()
  await expect(
    page.getByRole('region', { name: 'modify proposal for Kevin' }),
  ).toBeVisible()
  await expect(page.getByText(/Saved Kevin/)).toHaveCount(0)
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Approve change' }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    if (width === 375 || width === 1280)
      await page.screenshot({
        path: `/tmp/lifepoints-docs-${width}.png`,
        fullPage: true,
      })
  }
})
