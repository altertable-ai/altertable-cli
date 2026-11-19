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
  const total = page.getByRole('region', { name: 'Total cost', exact: true });
  await expect(total.getByText('$13,200.00', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'All customers Customer', exact: true })
    .click();
  await page.getByRole('option', { name: 'Atlas', exact: true }).click();
  await expect(total.getByText('$5,300.00', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'September 2026 Month', exact: true })
    .click();
  await page.getByRole('option', { name: 'August 2026', exact: true }).click();
  await expect(total.getByText('$4,800.00', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Service Breakdown', exact: true })
    .click();
  await page.getByRole('option', { name: 'Customer', exact: true }).click();
  await expect(
    page.getByLabel('Costs by customer', { exact: true })
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('starter-light.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(
    page.getByRole('button', { name: 'Switch to light theme' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'August 2026 Month', exact: true })
  ).toBeEnabled();
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('starter-dark.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Explore Total cost', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('Allocated cost');
  await page.getByRole('tab', { name: 'Queries', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('totalCost');
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
  await expect(page.getByText('$13,200.00', { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('starter-loading.png'),
    fullPage: true,
  });
  release();
  await expect(page.getByText('$13,200.00', { exact: true })).toBeVisible();
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
  await expect(page.getByRole('alert')).toHaveCount(3);
  for (let remaining = 3; remaining > 0; remaining--) {
    await page
      .getByRole('button', { name: 'Retry', exact: true })
      .first()
      .click();
    await expect(page.getByRole('alert')).toHaveCount(remaining - 1);
  }
  await request.post(control, { data: 'empty' });
  await page.reload();
  await expect(page.getByText('No allocations').first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('starter-empty.png'),
    fullPage: true,
  });
});

test('local transport only accepts registered queries and declared parameters', async ({
  request,
}) => {
  const valid = await request.post('/api/query/totalCost', {
    data: { limit: 1, params: { month: '2026-09', customerName: '' } },
  });
  expect(valid.status()).toBe(200);
  expect(await valid.json()).toMatchObject({ rows: [[1320000, 3]] });
  expect(
    (await request.post('/api/query/missing', { data: { limit: 1 } })).status()
  ).toBe(404);
  expect(
    (
      await request.post('/api/query/totalCost', {
        data: { statement: 'SELECT 1', limit: 1 },
      })
    ).status()
  ).toBe(400);
  expect(
    (
      await request.post('/api/query/totalCost', {
        data: { limit: 1, params: { arbitrarySql: 'DROP TABLE x' } },
      })
    ).status()
  ).toBe(400);
  expect(
    (
      await request.post('/api/query/totalCost', {
        headers: { origin: 'https://other.example' },
        data: { limit: 1 },
      })
    ).status()
  ).toBe(403);
});
