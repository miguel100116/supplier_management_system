import { test, expect, type Page } from '@playwright/test';

const email = 'synthetic.admin@mgenesis.com';
const userId = '00000000-0000-4000-8000-000000000001';
const createdAt = '2026-01-01T00:00:00.000Z';

// Only the external identity/data service is mocked; the built app and Express host run normally.
async function backend(page: Page, role: 'Admin' | 'Employee' = 'Admin', rejectPassword = false) {
  const profile = { email, user_id: userId, role, designation: 'Rank & File', department: 'TASS' };
  const user = { id: userId, email, email_confirmed_at: createdAt, aud: 'authenticated',
    role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: createdAt };
  const company = { id: 'synthetic-courier', name: 'Synthetic Courier', type: 'Courier',
    createdAt, branches: [], isArchived: false };
  const records: Array<{ record_type: string; record_id: string; payload: Record<string, unknown>; created_at: string }> = [
    { record_type: 'partner_company', record_id: company.id, payload: company, created_at: createdAt },
  ];
  const unexpected: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === 'http://127.0.0.1:4173') return route.continue();
    if (url.origin !== 'http://127.0.0.1:4174') {
      if (!['font', 'stylesheet'].includes(request.resourceType())) unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
      return route.abort();
    }
    const reply = (json: unknown, status = 200) => route.fulfill({ status, json });
    if (url.pathname === '/auth/v1/token') {
      if (rejectPassword) return reply({ code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, email,
        role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic-signature`;
      return reply({ access_token: accessToken, refresh_token: 'synthetic-refresh', expires_in: 3600, token_type: 'bearer', user });
    }
    if (url.pathname === '/auth/v1/user') return reply(user);
    if (url.pathname === '/auth/v1/logout') return reply({});
    if (url.pathname === '/rest/v1/app_profiles' && request.method() === 'GET') {
      return reply(request.headers().accept?.includes('object+json') ? profile : [profile]);
    }
    if (url.pathname === '/rest/v1/application_records') {
      if (request.method() === 'GET') {
        const type = url.searchParams.get('record_type')?.replace(/^eq\./, '');
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const limit = Number(url.searchParams.get('limit') ?? 1000);
        const rows = records.filter(record => record.record_type === type).slice(offset, offset + limit);
        return reply(request.headers().accept?.includes('object+json') ? rows[0] ?? null : rows);
      }
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        for (const row of Array.isArray(body) ? body : [body]) {
          const existing = records.findIndex(record => record.record_type === row.record_type && record.record_id === row.record_id);
          const saved = { ...row, created_at: row.created_at ?? createdAt };
          if (existing < 0) records.push(saved);
          else records[existing] = saved;
        }
        return reply([]);
      }
    }
    unexpected.push(`${request.method()} ${url.pathname}`);
    return route.abort();
  });
  return { records, unexpected, errors };
}

async function signIn(page: Page, audience: 'Admin' | 'Employee' = 'Admin') {
  await page.getByRole('button', { name: `${audience} Account`, exact: true }).click();
  await page.getByRole('textbox', { name: 'Company email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Synthetic-password-123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('a forged browser account cannot open a protected deep link', async ({ page }) => {
  const service = await backend(page);
  await page.addInitScript(() => localStorage.setItem('user_account', 'synthetic.admin@mgenesis.com'));
  await page.goto('/partners');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Employee Account', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Admin Account', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Admin Account', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
});

test('rejected passwords remain on the login screen with an error', async ({ page }) => {
  const service = await backend(page, 'Admin', true);
  await page.goto('/login');
  await signIn(page);
  await expect(page.getByRole('alert')).toContainText('Invalid login credentials');
  await expect(page).toHaveURL(/\/login$/);
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
});

test('an Employee identity cannot sign in through the Admin selection', async ({ page }) => {
  const service = await backend(page, 'Employee');
  await page.goto('/login');
  await signIn(page);
  await expect(page.getByRole('alert')).toContainText('Select Employee Account');
  await expect(page).toHaveURL(/\/login$/);
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
});

test('Admin directory filtering, archive dismissal and archive persistence work in the built UI', async ({ page }) => {
  const service = await backend(page);
  await page.goto('/login');
  await signIn(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/partners');
  const directory = page.getByRole('button', { name: 'Open Synthetic Courier partner record', exact: true }).filter({ visible: true });
  const search = page.getByRole('textbox', { name: 'Search partners by name or BP Code' });
  await expect(directory).toBeVisible();
  await search.fill('does-not-exist');
  await expect(directory).toHaveCount(0);
  await search.fill('Synthetic');
  await expect(directory).toBeVisible();
  const archive = page.getByRole('button', { name: 'Archive Synthetic Courier', exact: true }).filter({ visible: true });
  await archive.click();
  const confirmation = page.getByRole('dialog', { name: 'Archive Partner Company?' });
  await expect(confirmation).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  expect(service.records.find(record => record.record_id === 'synthetic-courier')?.payload.isArchived).toBe(false);
  await archive.click();
  await confirmation.getByRole('button', { name: 'Confirm Archive' }).click();
  await expect(confirmation).toHaveCount(0);
  await expect.poll(() => service.records.find(record => record.record_id === 'synthetic-courier')?.payload.isArchived).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Restore Synthetic Courier from archive', exact: true }).filter({ visible: true })).toBeVisible();
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
});
