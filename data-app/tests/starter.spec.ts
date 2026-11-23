import { expect, test } from '@playwright/test';

const control = `http://127.0.0.1:${Number(process.env.DATA_APP_TEST_PORT ?? 26418) + 1}/__test/state`;
test.beforeEach(async ({ request }) => {
  await request.post(control, { data: 'success' });
});

test('distributed example filters registered queries and supports inspection across themes', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'CLI scaffold test', exact: true })
  ).toBeVisible();
  const chart = page.getByLabel('Sample counts by group', { exact: true });
  await expect(chart).toBeVisible();
  await expect(chart).toContainText('Alpha');
  await expect(chart).toContainText('Beta');
  await page
    .getByRole('button', { name: 'All groups Group', exact: true })
    .click();
  await page.getByRole('option', { name: 'Gamma', exact: true }).click();
  await expect(chart).toContainText('Gamma');
  await expect(chart).not.toContainText('Alpha');
  await expect(page.getByText('No matching groups')).toHaveCount(0);
  await page.getByRole('button', { name: 'Gamma Group', exact: true }).click();
  await page.getByRole('option', { name: 'Alpha', exact: true }).click();
  await expect(chart).toContainText('Alpha');
  await expect(chart).not.toContainText('Beta');
  await page.screenshot({
    path: testInfo.outputPath('starter-light.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(
    page.getByRole('button', { name: 'Switch to light theme' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Alpha Group', exact: true })
  ).toBeEnabled();
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('starter-dark.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Explore Samples by group', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('Sample count');
  await page.getByRole('tab', { name: 'Queries', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('sampleCountsByGroup');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('loading, empty, failure and recovery keep the example usable', async ({
  page,
  request,
}, testInfo) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/api/query/*', async route => {
    await held;
    await route.continue();
  });
  await page.goto('/');
  const chart = page.getByLabel('Sample counts by group', { exact: true });
  await expect(chart).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('starter-loading.png'),
    fullPage: true,
  });
  release();
  await expect(chart).toBeVisible();
  await request.post(control, { data: 'failure' });
  await page.reload();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('starter-error.png'),
    fullPage: true,
  });
  await request.post(control, { data: 'success' });
  await page
    .getByRole('button', { name: 'Retry', exact: true })
    .first()
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(chart).toBeVisible();
  await request.post(control, { data: 'empty' });
  await page.reload();
  await expect(page.getByText('No matching groups').first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('starter-empty.png'),
    fullPage: true,
  });
});

test('local transport only accepts registered queries and declared parameters', async ({
  request,
}) => {
  const valid = await request.post('/api/query/sampleCountsByGroup', {
    data: { limit: 10, params: { groupName: 'all' } },
  });
  expect(valid.status()).toBe(200);
  expect(await valid.json()).toMatchObject({
    rows: [
      ['Alpha', 2000],
      ['Beta', 450],
      ['Gamma', 0],
    ],
  });
  expect(
    (await request.post('/api/query/missing', { data: { limit: 1 } })).status()
  ).toBe(404);
  expect(
    (
      await request.post('/api/query/sampleCountsByGroup', {
        data: { statement: 'SELECT 1', limit: 1 },
      })
    ).status()
  ).toBe(400);
  expect(
    (
      await request.post('/api/query/sampleCountsByGroup', {
        data: { limit: 1, params: { arbitrarySql: 'DROP TABLE x' } },
      })
    ).status()
  ).toBe(400);
  expect(
    (
      await request.post('/api/query/sampleCountsByGroup', {
        headers: { origin: 'https://other.example' },
        data: { limit: 1 },
      })
    ).status()
  ).toBe(403);
});
