import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';

const email = 'synthetic.admin@mgenesis.com';
const userId = '00000000-0000-4000-8000-000000000001';
const createdAt = '2026-01-01T00:00:00.000Z';

// Only the external identity/data service is mocked; the built app and Express host run normally.
async function backend(page: Page, role: 'Admin' | 'Employee' = 'Admin', rejectPassword = false) {
  const profile = { email, user_id: userId, role, designation: 'Rank & File', department: 'TASS' };
  const profiles = [profile];
  const user = { id: userId, email, email_confirmed_at: createdAt, aud: 'authenticated',
    role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: createdAt };
  const company = { id: 'synthetic-courier', name: 'Synthetic Courier', type: 'Courier',
    createdAt, branches: [], isArchived: false };
  const records: Array<{ record_type: string; record_id: string; payload: Record<string, unknown>; created_at: string }> = [
    { record_type: 'partner_company', record_id: company.id, payload: company, created_at: createdAt },
  ];
  const unexpected: string[] = [];
  const errors: string[] = [];
  const failures = { surveyWrites: false, historyBulkReads: false, historyFileReads: false };
  const historyReads: Array<{ select: string; id: string | null }> = [];
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
      const requestedEmail = url.searchParams.get('email')?.replace(/^eq\./, '');
      const matches = requestedEmail ? profiles.filter(item => item.email === requestedEmail) : profiles;
      return reply(request.headers().accept?.includes('object+json') ? matches[0] ?? null : matches);
    }
    if (url.pathname === '/rest/v1/application_records') {
      if (request.method() === 'GET') {
        const type = url.searchParams.get('record_type')?.replace(/^eq\./, '');
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const limit = Number(url.searchParams.get('limit') ?? 1000);
        let matching = records.filter(record => record.record_type === type);
        const id = url.searchParams.get('record_id');
        if (id?.startsWith('eq.')) matching = matching.filter(row => row.record_id === id.slice(3));
        if (id?.startsWith('in.')) matching = matching.filter(row => id.slice(4, -1).split(',').map(value => value.replace(/"/g, '')).includes(row.record_id));
        if (id?.startsWith('gt.')) matching = matching.filter(row => row.record_id > id.slice(3));
        if (url.searchParams.has('order')) matching.sort((a, b) => a.record_id.localeCompare(b.record_id));
        if (url.searchParams.has('payload->>fileDataUrl')) matching = matching.filter(row => row.payload.fileDataUrl != null);
        const selected = matching.slice(offset, offset + limit);
        const projection = url.searchParams.get('select') ?? '';
        if (type === 'export_history') {
          historyReads.push({ select: projection, id });
          if (projection.includes(',payload') && (failures.historyBulkReads && !id?.startsWith('eq.') || failures.historyFileReads)) {
            return reply({ code: '57014', message: 'canceling statement due to statement timeout' }, 500);
          }
        }
        const rows = type === 'export_history' && projection.includes('title:payload')
          ? selected.map(row => ({ record_id: row.record_id, ...Object.fromEntries(['id', 'title', 'format', 'filename', 'exportedAt', 'exportedBy', 'recipe'].map(key => [key, row.payload[key] ?? null])) }))
          : type === 'export_history' && projection === 'record_id' ? selected.map(row => ({ record_id: row.record_id })) : selected;
        return reply(request.headers().accept?.includes('object+json') ? rows[0] ?? null : rows);
      }
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        if (failures.surveyWrites && (Array.isArray(body) ? body : [body]).some(row => row.record_type === 'survey')) return reply({ message: 'Synthetic survey write rejected' }, 500);
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
  return { records, unexpected, errors, failures, profiles, historyReads };
}

async function signIn(page: Page, audience: 'Admin' | 'Employee' = 'Admin') {
  await page.getByRole('button', { name: `${audience} Account`, exact: true }).click();
  await page.getByRole('textbox', { name: 'Company email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Synthetic-password-123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // Let authentication settle before the next navigation can interrupt it.
  await expect(page.getByRole('main').or(page.getByRole('alert')).first()).toBeVisible();
}

test('Workspace category and status badges use consistent typography and geometry', async ({ page }, testInfo) => {
  const service = await backend(page);
  for (const [surveyType, status] of [['Courier', 'Running'], ['Supplier', 'Paused'], ['Subcontractor', 'Completed']] as const) {
    const form = { id: `badge-${surveyType}`, title: `${surveyType} evaluation`, surveyType, status,
      description: 'Synthetic form for badge presentation checks.', createdAt, questions: [] };
    service.records.push({ record_type: 'survey', record_id: form.id, payload: form, created_at: createdAt });
  }
  await page.goto('/login');
  await signIn(page);
  await page.goto('/evaluation-workspace');
  const rows = page.locator('.admin-survey-forms-page table tbody tr');
  await expect(rows).toHaveCount(3, { timeout: 10_000 });
  for (const dark of [false, true]) {
    await page.evaluate(enabled => document.body.classList.toggle('dark', enabled), dark);
    await page.screenshot({ path: testInfo.outputPath(`workspace-badges-${dark ? 'dark' : 'light'}.png`), animations: 'disabled' });
    for (const row of await rows.all()) {
      const badges = await row.evaluate(element => {
        const geometry = (cell: Element) => {
          const badge = cell.firstElementChild!;
          const css = getComputedStyle(badge);
          return { font: css.fontFamily, size: css.fontSize, weight: css.fontWeight,
            lineHeight: css.lineHeight, tracking: css.letterSpacing, casing: css.textTransform,
            padding: css.padding, radius: css.borderRadius, border: css.borderWidth,
            height: badge.getBoundingClientRect().height };
        };
        return { category: geometry(element.children[1]), status: geometry(element.children[2]) };
      });
      expect(badges.category).toEqual(badges.status);
      expect(badges.category.size).toBe('12px');
      const box = await row.getByRole('cell').nth(1).locator('span').boundingBox();
      const cell = await row.getByRole('cell').nth(1).boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(cell!.x + cell!.width);
    }
  }
  for (const label of ['ACTIVE', 'PAUSED', 'ENDED']) await expect(rows.getByText(label, { exact: true })).toBeVisible();
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
});

test('Leaderboard rating scale opens from the compact legend info control', async ({ page }, testInfo) => {
  const service = await backend(page);
  service.records.push({ record_type: 'survey_response', record_id: 'legend:Q01', created_at: createdAt,
    payload: { responseId: 'legend', surveyId: 'default-courier', companyId: 'synthetic-courier', company: 'Synthetic Courier',
      surveyType: 'Courier', respondentType: 'Rank & File', submissionDate: createdAt,
      questionId: 'Q01', questionNumber: 1, question: 'Reliability?', questionCategory: 'Reliability/Delivery',
      rating: 15, comment: '', dataSource: 'client_csv' } });
  await page.goto('/login');
  await signIn(page);
  await page.goto('/analytics');
  const legend = page.getByRole('group', { name: 'Company leaderboard color legend' });
  const info = legend.locator('summary');
  const scale = legend.locator('details > div');
  await expect(scale).toBeHidden();
  await expect(info).toHaveAccessibleName('Company leaderboard rating scale');
  expect(await info.locator('svg').getAttribute('width')).toBe('13');
  await expect(info.locator('../..')).toContainText('Unsatisfactory');
  const label = await info.locator('../..').boundingBox();
  const icon = await info.boundingBox();
  expect(icon!.x).toBeGreaterThan(label!.x);
  expect(Math.abs(icon!.y + icon!.height / 2 - label!.y - label!.height / 2)).toBeLessThan(2);
  await info.click();
  await expect(scale).toBeVisible();
  await expect(scale).toContainText('Excellent 95 to 100');
  const bounds = await scale.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: testInfo.outputPath('leaderboard-rating-scale.png') });
  await info.press('Escape');
  await expect(scale).toBeHidden();
  await info.press('Enter');
  await expect(scale).toBeVisible();
  await info.press('Space');
  await expect(scale).toBeHidden();
  await info.press('Enter');
  await info.press('Tab');
  await expect(scale).toBeHidden();
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
});

function headerFormat(element: Element) {
  const title = element.querySelector('h1')!;
  const subtitle = element.querySelector('p');
  const typography = (target: Element) => {
    const css = getComputedStyle(target);
    return [css.fontFamily, css.fontSize, css.fontWeight, css.lineHeight, css.letterSpacing, css.color];
  };
  return { title: typography(title), subtitle: subtitle && typography(subtitle),
    gap: subtitle && subtitle.getBoundingClientRect().top - title.getBoundingClientRect().bottom };
}

test('Admin module headings match the compact Directory title and subtitle format', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const service = await backend(page);
  await page.goto('/login');
  await signIn(page);
  await page.goto('/partners');
  const reference = await page.locator('.admin-directory-header').evaluate(headerFormat);
  const modules = [
    ['document-tracker', 'Documents', true], ['feedback-hub', 'Feedback', true],
    ['evaluation-workspace', 'Workspace', true], ['analytics', 'Analytics', true],
    ['reports', 'Reports', true], ['archive-center', 'Archive', true],
    ['import-evaluation-responses', 'Import Responses', true], ['employees-users', 'Users', false],
    ['present-mode', 'Present', false],
  ] as const;
  for (const [route, title, hasSubtitle] of modules) {
    await page.goto(`/${route}`);
    const header = page.locator('.admin-page-heading');
    await expect(header.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
    if (hasSubtitle) await expect(header.locator('p')).toHaveCount(1);
    if (route === 'employees-users') await expect(page.locator('.admin-accounts-page')).toBeVisible();
    if (route === 'present-mode') await expect(page.locator('.admin-presentation-page')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`heading-${route}.png`), animations: 'disabled' });
    const actual = await header.evaluate(headerFormat);
    expect(actual.title, title).toEqual(reference.title);
    if (hasSubtitle) {
      expect(actual.subtitle, title).toEqual(reference.subtitle);
      expect(actual.gap, title).toBeCloseTo(reference.gap!, 0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), title).toBe(false);
    if (route === 'document-tracker') {
      const action = header.getByRole('button', { name: 'Add Notification', exact: true });
      await action.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Document Expiry Notifications', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(action).toBeFocused();
      if (!testInfo.project.use.isMobile) {
        for (const width of [1920, 1024]) {
          await page.setViewportSize({ width, height: 900 });
          await page.screenshot({ path: testInfo.outputPath(`heading-documents-${width}.png`), animations: 'disabled' });
          const layout = await header.evaluate(element => {
            const copy = element.querySelector('.admin-page-heading-copy')!.getBoundingClientRect();
            const button = element.querySelector('button')!.getBoundingClientRect();
            return { gap: button.left - copy.right, right: button.right, viewport: innerWidth };
          });
          expect(layout.gap).toBeGreaterThanOrEqual(12);
          expect(layout.right).toBeLessThanOrEqual(layout.viewport);
        }
        await page.setViewportSize({ width: 1280, height: 720 });
      }
    }
    if (route === 'evaluation-workspace') {
      const tabs = page.getByRole('navigation', { name: 'Evaluation workspace views' });
      await tabs.getByRole('button', { name: 'Category Labels', exact: true }).click();
      await expect(header.locator('p')).toHaveText('Change the displayed scoring category names for each survey type.');
      await expect(header.locator('p')).toHaveCount(1);
      await expect(page.getByText(/Each partner type is evaluated across 5 categories/)).toBeVisible();
      await tabs.getByRole('button', { name: 'Forms', exact: true }).click();
      await expect(header.locator('p')).toHaveText('Create and manage evaluation forms, assigned companies, deadlines, and access.');
    }
  }
  const navigate = async (label: string) => {
    if (testInfo.project.use.isMobile) {
      await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
      await page.locator('.admin-mobile-navigation').getByRole('button', { name: label, exact: true }).click();
    } else {
      await page.getByRole('navigation', { name: 'Administrator workspace', exact: true })
        .getByRole('button', { name: label, exact: true }).click();
    }
  };
  // Exercise portal cleanup while the Shell stays mounted, including a hidden heading.
  await page.goto('/document-tracker');
  await expect(page.locator('.admin-page-heading p')).toContainText('Monitor partner compliance documents');
  await navigate('Directory');
  await expect(page.locator('.admin-directory-header h1')).toHaveText('Partner directory');
  await expect(page.locator('.admin-page-heading')).toHaveCount(0);
  await navigate('Analytics');
  await expect(page.locator('.admin-page-heading p')).toHaveText('Review evaluation results, identify performance gaps, and compare partner companies.');
  await navigate('Users');
  await expect(page.locator('.admin-page-heading h1')).toHaveText('Users');
  await expect(page.locator('.admin-page-heading p')).toHaveCount(0);
  await expect(page.getByText('Review evaluation results, identify performance gaps, and compare partner companies.', { exact: true })).toHaveCount(0);
  await navigate('Directory');
  await page.evaluate(() => document.body.classList.add('dark'));
  const darkReference = await page.locator('.admin-directory-header').evaluate(headerFormat);
  await expect(page.locator('.admin-directory-header h1')).toHaveCSS('color', 'rgb(230, 237, 245)');
  await navigate('Documents');
  await expect(page.locator('.admin-page-heading p')).toHaveCount(1);
  const darkActual = await page.locator('.admin-page-heading').evaluate(headerFormat);
  expect(darkActual).toEqual(darkReference);
  await page.screenshot({ path: testInfo.outputPath('heading-documents-dark.png'), animations: 'disabled' });
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
});

test('Admin desktop uses the compact workspace scale while mobile retains its normal scale', async ({ page }, testInfo) => {
  const service = await backend(page);
  const survey = { id: 'synthetic-survey', title: 'Courier Satisfaction Survey', surveyType: 'Courier',
    description: 'Standard satisfaction reporting for external courier and logistics.', createdAt,
    status: 'Running', deadlineDate: '2099-12-31', questions: [] };
  service.records.push({ record_type: 'survey', record_id: survey.id, payload: survey, created_at: createdAt });
  await page.goto('/login');
  await expect(page.locator('html')).toHaveCSS('zoom', '1');
  await signIn(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/evaluation-workspace');
  await expect(page.getByRole('button', { name: `Preview ${survey.title}`, exact: true })).toBeVisible();
  const desktop = !testInfo.project.use.isMobile;
  await expect(page.locator('html')).toHaveCSS('zoom', desktop ? '0.9' : '1');
  const geometry = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    sidebar: document.querySelector('.admin-sidebar')!.getBoundingClientRect().toJSON(),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  expect(geometry.overflow).toBe(false);
  expect(geometry.sidebar.bottom).toBeCloseTo(geometry.viewport.height, 0);
  if (desktop) {
    expect(geometry.sidebar.width).toBeCloseTo(238 * 0.9, 0);
    const normalHeaderHeight = await page.locator('.admin-topbar').evaluate(element => {
      document.documentElement.style.zoom = '1';
      const height = element.getBoundingClientRect().height;
      document.documentElement.style.removeProperty('zoom');
      return height;
    });
    const compactHeader = await page.locator('.admin-topbar').boundingBox();
    expect(compactHeader!.height).toBeCloseTo(normalHeaderHeight * 0.9, 0);
  }
  await page.screenshot({ path: testInfo.outputPath('workspace.png') });
  await page.getByRole('table').getByRole('button', { name: 'Archive', exact: true }).click();
  const dialog = page.getByRole('heading', { name: 'Archive this form?', exact: true });
  await expect(dialog).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(geometry.viewport.height);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(service.records.find(record => record.record_id === survey.id)?.payload.status).toBe('Running');
  if (desktop) {
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.locator('html')).toHaveCSS('zoom', '0.9');
    await page.screenshot({ path: testInfo.outputPath('workspace-small-laptop.png') });
    await page.setViewportSize({ width: 800, height: 768 });
    await expect(page.locator('html')).toHaveCSS('zoom', '1');
    await page.setViewportSize({ width: 801, height: 768 });
    await expect(page.locator('html')).toHaveCSS('zoom', '0.9');
  }
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
});

test('Employee desktop shares the compact scale while mobile and login retain normal sizing', async ({ page }, testInfo) => {
  const service = await backend(page, 'Employee');
  await page.goto('/login');
  await expect(page.locator('html')).toHaveCSS('zoom', '1');
  await signIn(page, 'Employee');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Good to see you, Synthetic.', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('employee-home.png'), animations: 'disabled' });
  const desktop = !testInfo.project.use.isMobile;
  await expect(page.locator('html')).toHaveCSS('zoom', desktop ? '0.9' : '1');
  const sidebar = await page.locator('.employee-experience.app-shell > .sidebar').boundingBox();
  expect(sidebar!.y + sidebar!.height).toBeCloseTo(page.viewportSize()!.height, 0);
  if (desktop) expect(sidebar!.width).toBeCloseTo(238 * 0.9, 0);

  const navigation = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  await navigation.getByRole('button', { name: 'Evaluations', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Evaluations', exact: true })).toBeVisible();
  await navigation.getByRole('button', { name: 'My submissions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My submissions', exact: true })).toBeVisible();
  if (desktop) {
    const shell = await page.locator('.employee-experience.app-shell').boundingBox();
    expect(shell!.height).toBeGreaterThanOrEqual(page.viewportSize()!.height - 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.getByRole('button', { name: 'View quick guide', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Your experience. Your feedback.', exact: true });
  await expect(dialog).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  if (desktop) {
    await navigation.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Good to see you, Synthetic.', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.screenshot({ path: testInfo.outputPath('employee-home-small-laptop.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 800, height: 768 });
    await expect(page.locator('html')).toHaveCSS('zoom', '1');
    await page.setViewportSize({ width: 801, height: 768 });
    await expect(page.locator('html')).toHaveCSS('zoom', '0.9');
  }
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
});

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

test('Admin directory filtering, archive dismissal and archive persistence work in the built UI', async ({ page }, testInfo) => {
  const service = await backend(page);
  await page.goto('/login');
  await signIn(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/partners');
  const directory = page.getByRole('button', { name: 'Open Synthetic Courier partner record', exact: true }).filter({ visible: true });
  const search = page.getByRole('textbox', { name: 'Search partners by name or BP Code' });
  await expect(directory).toBeVisible();
  const checkActionSpacing = async (state: string) => {
    if (testInfo.project.use.isMobile) {
      await page.locator('.admin-directory-table-shell').screenshot({ path: testInfo.outputPath(`directory-${state}-mobile.png`) });
      return;
    }
    for (const width of [1920, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('.admin-directory-table-shell').screenshot({ path: testInfo.outputPath(`directory-${state}-${width}.png`) });
      const spacing = await page.locator('.admin-directory-table tbody tr').first().evaluate(row => {
        const cells = row.querySelectorAll('td');
        const health = cells[cells.length - 2];
        const contentRight = Math.max(...Array.from(health.querySelectorAll('span'), span => span.getBoundingClientRect().right));
        const actions = row.querySelector('.admin-directory-actions')!;
        const archivedDate = document.createRange();
        if (cells.length === 7) archivedDate.selectNodeContents(cells[3]);
        return {
          gap: actions.firstElementChild!.getBoundingClientRect().left - contentRight,
          rowRight: row.getBoundingClientRect().right,
          actionsRight: actions.lastElementChild!.getBoundingClientRect().right,
          archivedDateGap: cells.length === 7
            ? cells[4].firstElementChild!.getBoundingClientRect().left - archivedDate.getBoundingClientRect().right
            : null,
        };
      });
      expect(spacing.gap).toBeGreaterThanOrEqual(12);
      expect(spacing.gap).toBeLessThanOrEqual(80);
      expect(spacing.actionsRight).toBeLessThanOrEqual(spacing.rowRight);
      if (spacing.archivedDateGap !== null) expect(spacing.archivedDateGap).toBeGreaterThanOrEqual(8);
    }
  };
  await checkActionSpacing('active');
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
  await checkActionSpacing('archived');
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
});

const evaluationForm = {
  id: 'synthetic-form', title: 'Synthetic evaluation', surveyType: 'Courier', description: 'Synthetic only',
  createdAt, status: 'Running', deadlineDate: '31/12/2099',
  questions: [{ questionId: 'Q1', questionNumber: 1, question: 'Service quality?', questionCategory: 'Quality' }],
};

test('Archived report builders select one item, update the document preview and retain export scope', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const service = await backend(page);
  service.records[0].payload.isArchived = true;
  for (const [id, name, type] of [['second-courier', 'Second archived courier', 'Courier'], ['empty-courier', 'Archived company without evaluations', 'Courier'], ['supplier', 'Archived supplier', 'Supplier']]) {
    service.records.push({ record_type: 'partner_company', record_id: id, created_at: createdAt, payload: { id, name, type, createdAt, isArchived: true } });
  }
  for (const [id, title] of [['archive-a', 'First archived survey'], ['archive-b', 'Second archived survey']]) {
    service.records.push({ record_type: 'survey', record_id: id, created_at: createdAt, payload: { ...evaluationForm, id, title, status: 'Archived',
      questions: [{ questionId: 'Q01', questionNumber: 1, question: 'Delivery reliability', questionCategory: 'Delivery' }] } });
  }
  for (const [id, label] of [['half-one', 'First half'], ['half-two', 'Second half']]) {
    service.records.push({ record_type: 'archive_series', record_id: id, created_at: createdAt, payload: { id, label, createdAt } });
  }
  for (const [id, surveyId, companyId, seriesId, rating, source] of [
    ['a-one', 'archive-a', 'synthetic-courier', 'half-one', 15, 'client_csv'],
    ['a-two', 'archive-a', 'second-courier', 'half-one', 10, 'client_csv'],
    ['a-three', 'archive-a', 'synthetic-courier', 'half-two', 0, 'client_csv'],
    ['b-one', 'archive-b', 'second-courier', 'half-one', 5, 'client_csv'],
    ['test-only', 'archive-a', 'synthetic-courier', 'half-one', 15, 'test_submission'],
  ]) {
    service.records.push({ record_type: 'survey_response', record_id: `${id}:Q01`, created_at: createdAt, payload: {
      responseId: id, surveyId, companyId, company: companyId === 'second-courier' ? 'Second archived courier' : 'Synthetic Courier',
      surveyType: 'Courier', respondentType: 'Employee', respondentEmail: 'private@example.test', submissionDate: '2026-06-01T00:00:00Z',
      questionId: 'Q01', questionNumber: 1, question: 'Delivery reliability', questionCategory: 'Delivery', rating,
      comment: '=SUM(1,1)', archived: true, archivedAt: '2026-07-01T00:00:00Z', seriesId, dataSource: source,
    } });
  }
  const openBuilder = async (title: string) => page.getByRole('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).getByRole('button', { name: 'Build report', exact: true }).click();
  await page.goto('/login');
  await signIn(page);
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Archived reports', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Data source', exact: true })).toHaveCount(0);
  await openBuilder('Archived Survey Report');
  await expect(page.getByRole('combobox', { name: 'Archived survey', exact: true })).toHaveValue('archive-a');
  await page.getByRole('combobox', { name: 'Archived survey', exact: true }).selectOption('');
  await expect(page.getByRole('button', { name: 'Download report', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Archived survey', exact: true }).selectOption('archive-a');
  const preview = page.getByLabel('Archived report preview', { exact: true });
  await expect(preview.getByRole('row', { name: 'Stored submissions 4', exact: true })).toBeVisible();
  await expect(preview.getByRole('row', { name: 'Staging/test answer rows 1', exact: true })).toBeVisible();
  await expect(preview.getByRole('row', { name: 'Evaluated companies 2', exact: true })).toBeVisible();
  await expect(preview).not.toContainText('private@example.test');
  await expect(preview).not.toContainText('=SUM(1,1)');
  await expect(page.getByRole('option', { name: 'All companies', exact: true })).toHaveCount(0);
  const optionsBox = await page.getByRole('complementary', { name: 'Archived report options' }).boundingBox();
  const documentBox = await page.getByRole('region', { name: 'Archived report document', exact: true }).boundingBox();
  if (testInfo.project.use.isMobile) {
    expect(optionsBox!.y + optionsBox!.height).toBeLessThanOrEqual(documentBox!.y);
    const table = preview.getByRole('region', { name: 'Company performance', exact: true });
    expect(await table.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  } else expect(optionsBox!.x + optionsBox!.width).toBeLessThan(documentBox!.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('archived-survey-builder.png'), fullPage: true, animations: 'disabled' });
  await page.evaluate(() => document.body.classList.add('dark'));
  await page.screenshot({ path: testInfo.outputPath('archived-survey-builder-dark.png'), fullPage: true, animations: 'disabled' });
  await page.evaluate(() => document.body.classList.remove('dark'));
  for (const format of ['pdf', 'excel', 'docx']) {
    await page.getByRole('combobox', { name: 'File format', exact: true }).selectOption(format);
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download report', exact: true }).click();
    const bytes = await readFile((await (await downloaded).path())!);
    if (format === 'pdf') {
      const pdf = bytes.toString('latin1');
      expect(pdf).toMatch(/^%PDF-/);
      for (const text of ['Archived Survey Report', 'First archived survey', 'MBS Partner Evaluation System', 'Report scope', 'Microgenesis Supplier Management System']) {
        expect(pdf).toContain(text);
      }
      expect(pdf).not.toContain('This report provides a comprehensive summary of survey analytics');
    }
    else if (format === 'docx') {
      const archive = XLSX.CFB.read(bytes, { type: 'buffer' });
      const xml = XLSX.CFB.find(archive, '/word/document.xml')!;
      expect(Buffer.from(xml.content as Uint8Array).toString()).toContain('First archived survey');
    } else {
      const workbook = XLSX.read(bytes);
      const scope = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
      expect(scope).toContainEqual(['Selected item', 'First archived survey']);
      expect(scope).toContainEqual(['Stored submissions', 4]);
    }
  }
  await expect.poll(() => service.records.filter(record => record.record_type === 'export_history').length).toBe(3);
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await expect(page.getByText(/Courier \| First archived survey/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Regenerate', exact: true }).first().click();
  await expect(page.getByRole('combobox', { name: 'Archived survey', exact: true })).toHaveValue('archive-a');
  await expect(preview.getByRole('row', { name: 'Stored submissions 4', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('Supplier');
  await expect(page.getByRole('combobox', { name: 'Archived survey', exact: true })).toHaveValue('');
  await expect(preview).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download report', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Back to Reports', exact: true }).click();
  await openBuilder('Archived Response Report');
  await page.getByRole('combobox', { name: 'Response archive', exact: true }).selectOption('half-one');
  await expect(preview.getByRole('row', { name: 'Stored submissions 4', exact: true })).toBeVisible();
  await page.getByLabel('Include respondent comments', { exact: true }).check();
  await page.getByRole('combobox', { name: 'File format', exact: true }).selectOption('csv');
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report', exact: true }).click();
  const csv = await readFile((await (await csvDownload).path())!, 'utf8');
  expect(csv).toContain("'=SUM(1,1)");
  expect(csv).not.toContain('a-three');
  expect(csv).not.toContain('private@example.test');
  await page.getByRole('combobox', { name: 'Response archive', exact: true }).selectOption('half-two');
  await expect(preview.getByRole('row', { name: 'Stored submissions 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Reports', exact: true }).click();
  await openBuilder('Archived Company Report');
  await page.getByRole('combobox', { name: 'Archived company', exact: true }).selectOption('synthetic-courier');
  await expect(preview.getByRole('row', { name: 'Stored submissions 3', exact: true })).toBeVisible();
  await expect(preview).not.toContainText('Second archived courier');
  await page.getByRole('combobox', { name: 'Archived company', exact: true }).selectOption('empty-courier');
  await expect(page.getByRole('heading', { name: 'No response data', exact: true })).toBeVisible();
  await expect(preview.getByRole('table', { name: 'Company profile', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download report', exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('archived-company-builder-empty.png'), fullPage: true, animations: 'disabled' });
  await page.reload();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download again', exact: true })).toHaveCount(4);
  expect(service.records[0].payload.isArchived).toBe(true);
  expect(service.records.find(record => record.record_type === 'survey')?.payload.status).toBe('Archived');
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
});

test('a staging-only Supplier response archive matches Archive Center and all report downloads recover from failure', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const service = await backend(page);
  const archiveLabel = 'Single staged supplier archive';
  service.records.push({ record_type: 'archive_series', record_id: 'staged-only', created_at: createdAt,
    payload: { id: 'staged-only', label: archiveLabel, createdAt } });
  service.records.push({ record_type: 'survey_response', record_id: 'RESP-staged-only:Q39', created_at: createdAt, payload: {
    responseId: 'RESP-staged-only', surveyId: 'supplier-form', companyId: 'supplier-company', company: 'Sample supplier', surveyType: 'Supplier',
    respondentType: 'Employee', submissionDate: '2026-06-01T00:00:00Z', questionId: 'Q39', questionNumber: 1,
    question: 'Delivery reliability', questionCategory: 'Delivery', rating: 'N/A', comment: '', dataSource: 'test_submission',
    archived: true, archivedAt: '2026-07-01T00:00:00Z', archivedBySurveyId: 'supplier-form', archivedBySurveyTitle: archiveLabel, seriesId: 'staged-only',
  } });
  await page.goto('/login');
  await signIn(page);
  await page.goto('/archive-center');
  await page.getByRole('button', { name: /Archived Responses/ }).click();
  await expect(page.getByLabel('Archived survey forms', { exact: true }).getByText(archiveLabel, { exact: true })).toBeVisible();
  await page.goto('/reports');
  await page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Archived Response Report', exact: true }) }).getByRole('button', { name: 'Build report', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Category', exact: true })).toHaveValue('Supplier');
  const selector = page.getByRole('combobox', { name: 'Response archive', exact: true });
  await expect(selector).toHaveValue('staged-only');
  await expect(selector.getByRole('option', { name: archiveLabel, exact: true })).toHaveCount(1);
  const preview = page.getByLabel('Archived report preview', { exact: true });
  await expect(preview.getByRole('row', { name: 'Stored submissions 1', exact: true })).toBeVisible();
  await expect(preview.getByRole('row', { name: 'Countable responses 0', exact: true })).toBeVisible();
  await expect(preview.getByRole('row', { name: 'Staging/test answer rows 1', exact: true })).toBeVisible();
  const downloadButton = page.getByRole('button', { name: 'Download report', exact: true });
  await expect(downloadButton).toBeEnabled();
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    URL.createObjectURL = () => { URL.createObjectURL = original; throw new Error('Synthetic download blocked'); };
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
  });
  await downloadButton.click();
  await expect(page.getByRole('alert')).toContainText('Synthetic download blocked');
  await expect(downloadButton).toBeEnabled();
  expect(service.records.filter(record => record.record_type === 'export_history')).toHaveLength(0);
  for (const format of ['pdf', 'excel', 'csv']) {
    await page.getByRole('combobox', { name: 'File format', exact: true }).selectOption(format);
    const downloaded = page.waitForEvent('download');
    await downloadButton.click();
    const download = await downloaded;
    const bytes = await readFile((await download.path())!);
    expect(bytes.length).toBeGreaterThan(0);
    expect(download.suggestedFilename()).toMatch(/^sms_archived-response-report_.*\.(pdf|xlsx|csv)$/);
    if (format === 'pdf') expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    else if (format === 'excel') {
      const workbook = XLSX.read(bytes);
      expect(XLSX.utils.sheet_to_json(workbook.Sheets['Response details'], { header: 1 })).toContainEqual([
        'RESP-staged-only', 'Sample supplier', '2026-06-01T00:00:00Z', 'Delivery reliability', 'N/A',
      ]);
    } else expect(bytes.toString()).toContain('RESP-staged-only');
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  await expect.poll(() => service.records.filter(record => record.record_type === 'export_history').length).toBe(3);
  expect(service.records.filter(record => record.record_type === 'export_history').every(record => /^EXP-[a-f0-9]{32}$/.test(String(record.payload.id)))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('staging-archive-downloads.png'), fullPage: true, animations: 'disabled' });
  await page.reload();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download again', exact: true })).toHaveCount(3);
  await page.getByRole('button', { name: 'Regenerate', exact: true }).first().click();
  await expect(page.getByRole('combobox', { name: 'Category', exact: true })).toHaveValue('Supplier');
  await expect(page.getByRole('combobox', { name: 'Response archive', exact: true })).toHaveValue('staged-only');
  expect(service.records.find(record => record.record_type === 'survey_response')?.payload.archived).toBe(true);
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
});

test('History retains saved files across recipe versions without quarantine warnings', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const service = await backend(page);
  service.failures.historyBulkReads = true;
  const fileDataUrl = 'data:application/pdf;base64,JVBERi10ZXN0';
  const base = { format: 'pdf', exportedAt: '2026-10-26T00:00:00Z', fileDataUrl };
  for (let index = 0; index < 5; index++) service.records.push({ record_type: 'export_history', record_id: `legacy-${index}`, created_at: createdAt,
    payload: { ...base, id: `legacy-${index}`, title: `Legacy saved report ${index}`, filename: `legacy-${index}.pdf` } });
  const current = { kind: 'archived-responses', parameters: { category: 'Supplier', archivedItemId: 'one-archive', archivedItemLabel: 'One archive' } };
  service.records.push({ record_type: 'export_history', record_id: 'current-history', created_at: createdAt,
    payload: { ...base, id: 'current-history', title: 'Current archived response report', filename: 'current.pdf', recipe: current } });
  await page.goto('/login');
  await signIn(page);
  await page.goto('/reports?tab=history');
  await expect(page.getByRole('button', { name: 'Download again', exact: true })).toHaveCount(6);
  const currentEntry = page.getByRole('article').filter({ hasText: 'Current archived response report' });
  await expect(currentEntry.getByRole('button', { name: 'Regenerate', exact: true })).toBeEnabled();
  await expect(page.getByText(/quarantined during refresh/)).toHaveCount(0);

  const futureRecipe = { kind: 'future-report-builder', parameters: {} };
  service.records.push({ record_type: 'export_history', record_id: 'future-history', created_at: createdAt,
    payload: { ...base, id: 'future-history', title: 'Future-version saved report', filename: 'future.pdf', recipe: futureRecipe } });
  service.records.push({ record_type: 'export_history', record_id: 'invalid-options', created_at: createdAt,
    payload: { ...base, id: 'invalid-options', title: 'Saved report with invalid options', filename: 'invalid-options.pdf', recipe: { kind: 'summary', parameters: [] } } });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Download again', exact: true })).toHaveCount(8);
  const futureEntry = page.getByRole('article').filter({ hasText: 'Future-version saved report' });
  const invalidEntry = page.getByRole('article').filter({ hasText: 'Saved report with invalid options' });
  for (const entry of [futureEntry, invalidEntry]) {
    await expect(entry).toContainText('Saved options are incompatible or invalid.');
    await expect(entry.getByRole('button', { name: 'Download again', exact: true })).toBeEnabled();
    await expect(entry.getByRole('button', { name: 'Regenerate', exact: true })).toBeDisabled();
    await expect(entry.getByRole('button', { name: 'Regenerate', exact: true })).toHaveAttribute('title', /Saved options are unavailable/);
  }
  await expect(currentEntry.getByRole('button', { name: 'Regenerate', exact: true })).toBeEnabled();
  await expect(page.getByText(/quarantined during refresh/)).toHaveCount(0);
  expect(service.historyReads.every(read => !read.select.includes(',payload'))).toBe(true);
  service.failures.historyFileReads = true;
  await futureEntry.getByRole('button', { name: 'Download again', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Unable to download the saved file. Please retry');
  service.failures.historyFileReads = false;
  const downloaded = page.waitForEvent('download');
  await futureEntry.getByRole('button', { name: 'Download again', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('future.pdf');
  expect(await readFile((await download.path())!, 'utf8')).toBe('%PDF-test');
  await page.screenshot({ path: testInfo.outputPath('history-recipe-compatibility.png'), fullPage: true, animations: 'disabled' });
  expect(service.records.filter(record => record.record_type === 'export_history')).toHaveLength(8);
  const stored = service.records.find(record => record.record_id === 'future-history')!.payload;
  expect(stored.recipe).toEqual(futureRecipe);
  expect(stored).not.toHaveProperty('recipeUnavailable');
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
});

test('Admin Settings waits for activity and retries a failed first load', async ({ page }) => {
  const service = await backend(page);
  let releaseFirstRead: (() => void) | undefined;
  const firstRead = new Promise<void>(resolve => { releaseFirstRead = resolve; });
  let activityReads = 0;
  await page.route('**/rest/v1/application_records?*', async route => {
    const type = new URL(route.request().url()).searchParams.get('record_type');
    if (type !== 'eq.admin_activity') return route.fallback();
    activityReads += 1;
    if (activityReads === 1) {
      await firstRead;
      return route.fulfill({ status: 500, json: { message: 'Synthetic activity read failure' } });
    }
    return route.fallback();
  });
  await page.goto('/login');
  await signIn(page);
  await page.locator('#account-menu-trigger').click();
  await page.locator('#settings-button').click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog.getByRole('status')).toContainText('Loading settings');
  await expect(dialog.getByText('System Snapshot')).toHaveCount(0);
  await expect.poll(() => activityReads).toBe(1);
  releaseFirstRead!();
  await expect(dialog.getByRole('alert')).toContainText('Synthetic activity read failure');
  await dialog.getByRole('button', { name: 'Retry loading settings' }).click();
  await expect(dialog.getByText('System Snapshot')).toBeVisible();
  expect(activityReads).toBe(2);
  expect(service.errors).toEqual([]);
  expect(service.unexpected).toEqual([]);
});

test('Reports load History only on first visit and reuse it on return navigation', async ({ page }) => {
  const service = await backend(page);
  await page.goto('/login');
  await signIn(page);
  await expect(page.getByRole('main')).toBeVisible();
  expect(service.historyReads.length).toBe(0);
  await page.goto('/reports?tab=history');
  await expect(page.getByText('No exports yet')).toBeVisible();
  const firstVisitReads = service.historyReads.length;
  expect(firstVisitReads).toBeGreaterThan(0);
  await page.getByRole('tab', { name: 'Generate', exact: true }).click();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  expect(service.historyReads.length).toBe(firstVisitReads);
  expect(service.errors).toEqual([]);
});

test('Question Report quick export exposes and downloads Word below the report library', async ({ page }, testInfo) => {
  await backend(page);
  await page.goto('/login');
  await signIn(page);
  await page.goto('/reports');
  const question = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Question Report', exact: true }) });
  await question.getByRole('button', { name: 'Export', exact: true }).click();
  const word = question.getByRole('button', { name: 'Word (.docx)', exact: true });
  await word.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('question-quick-export-menu.png'), fullPage: true, animations: 'disabled' });
  const event = page.waitForEvent('download');
  await word.click();
  const download = await event;
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
  const archive = XLSX.CFB.read(await readFile((await download.path())!), { type: 'buffer' });
  const document = XLSX.CFB.find(archive, '/word/document.xml');
  expect(document).toBeTruthy();
  expect(Buffer.from(document!.content as Uint8Array).toString('utf8')).toContain('Question Report (All Questions)');
});

test('Word reports export complete descending company rankings and History refresh avoids retained file bulk reads', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const service = await backend(page);
  service.failures.historyBulkReads = true;
  const names = Array.from({ length: 24 }, (_, index) => `Ranking Partner ${String(index).padStart(2, '0')}`);
  names[0] = '=1+1';
  names.forEach((company, index) => {
    service.records.push({ record_type: 'partner_company', record_id: `ranking-company-${index}`, created_at: createdAt,
      payload: { id: `ranking-company-${index}`, name: company, type: 'Courier', createdAt, branches: [], isArchived: false } });
    service.records.push({ record_type: 'survey_response', record_id: `ranking-${index}:Q01`, created_at: createdAt,
    payload: { responseId: `ranking-${index}`, companyId: `ranking-company-${index}`, company, surveyType: 'Courier', respondentType: 'Rank & File',
      submissionDate: new Date().toISOString(), questionId: 'Q01', questionNumber: 1, question: 'Reliability?', questionCategory: 'Reliability/Delivery',
      rating: 15 * (index + 1) / 24, comment: '', dataSource: 'client_csv' } });
  });
  await page.goto('/login');
  await signIn(page);
  const library = async () => {
    const back = page.getByRole('button', { name: 'Go back', exact: true }).or(page.getByRole('button', { name: 'Back to Reports', exact: true }));
    if (await back.count()) await back.first().click();
    else { await page.goto('/reports'); await expect(page.getByRole('main')).toBeVisible(); }
    await expect(page.getByRole('heading', { name: 'Companies Report', exact: true })).toBeVisible();
  };
  let exports = 0;
  const card = (name: string) => page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
  const word = async () => {
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Word (.docx)', exact: true }).click();
    const download = await event;
    expect(download.suggestedFilename()).toMatch(/\.docx$/);
    const bytes = await readFile((await download.path())!);
    await expect.poll(() => service.records.filter(record => record.record_type === 'export_history').length).toBe(++exports);
    const archive = XLSX.CFB.read(bytes, { type: 'buffer' });
    const file = XLSX.CFB.find(archive, '/word/document.xml');
    expect(file).toBeTruthy();
    return { bytes, xml: Buffer.from(file!.content as Uint8Array).toString('utf8') };
  };
  const checkRanking = (xml: string) => {
    const table = Array.from(xml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/g)).map(match => match[0]).find(value => value.includes('Leaderboard Score'))!;
    expect(table).toContain('Responses');
    let previous = -1;
    for (const company of names.slice().reverse()) {
      const index = table.indexOf(company);
      expect(index).toBeGreaterThan(previous);
      previous = index;
    }
    expect(xml).not.toMatch(/Least Rated Companies|Lowest Rated Partners|Evaluations Count|Bottom 10/);
  };

  const footerExport = async () => {
    const button = page.getByRole('button', { name: 'Export', exact: true });
    await button.scrollIntoViewIfNeeded();
    if (testInfo.project.use.isMobile) {
      const control = await button.boundingBox();
      const navigation = await page.locator('.admin-sidebar').boundingBox();
      expect(control!.y + control!.height).toBeLessThanOrEqual(navigation!.y);
    }
    await button.click();
    if (testInfo.project.use.isMobile) await page.screenshot({ path: testInfo.outputPath('mobile-footer-export.png'), fullPage: true, animations: 'disabled' });
  };
  await library();
  await card('Companies Report').getByRole('button', { name: 'Export', exact: true }).click();
  checkRanking((await word()).xml);
  await card('Companies Report').getByRole('button', { name: 'Build report', exact: true }).click();
  await footerExport();
  await expect(page.getByRole('button', { name: 'Word (.docx)', exact: true })).toBeVisible();
  await library();
  await card('Summary Report').getByRole('button', { name: 'Build report', exact: true }).click();
  const ranking = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Company Name', exact: true }) });
  await expect(ranking.locator('tbody tr')).toHaveCount(24);
  await expect(ranking.getByRole('columnheader', { name: 'Responses', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Lowest Rated/ })).toHaveCount(0);
  await page.getByRole('heading', { name: 'Company Rankings (Highest to Lowest)', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('summary-descending-rankings.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Export Report', exact: true }).click();
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV Spreadsheet', exact: true }).click();
  const csv = await readFile((await (await csvDownload).path())!, 'utf8');
  expect(csv).toContain("\"'=1+1\"");
  await expect.poll(() => service.records.filter(record => record.record_type === 'export_history').length).toBe(++exports);
  await page.getByRole('button', { name: 'Export Report', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('word-export-menu.png'), fullPage: true, animations: 'disabled' });
  checkRanking((await word()).xml);

  await library();
  await page.getByRole('button', { name: 'Build Executive Report', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Company Rankings (Highest to Lowest)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Export Executive Dossier', exact: true }).click();
  checkRanking((await word()).xml);

  await library();
  await card('Question Report').getByRole('button', { name: 'Build report', exact: true }).click();
  await footerExport();
  expect((await word()).xml).toContain('Reliability?');

  await library();
  await card('Raw Data Export').getByRole('button', { name: 'Build report', exact: true }).click();
  await page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Courier', exact: true }) }).getByRole('button', { name: 'Export As', exact: true }).click();
  const raw = await word();
  for (const company of names) expect(raw.xml).toContain(company);
  await expect.poll(() => service.records.filter(record => record.record_type === 'export_history').length).toBe(6);
  await page.getByRole('button', { name: 'Back to Reports', exact: true }).click();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await page.reload();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download again', exact: true })).toHaveCount(6);
  expect(service.historyReads.every(read => !read.select.includes(',payload'))).toBe(true);
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download again', exact: true }).first().click();
  expect((await readFile((await (await saved).path())!)).equals(raw.bytes)).toBe(true);
  await expect(page.getByText(/statement timeout|quarantined during refresh/)).toHaveCount(0);
  expect(service.errors).toEqual([]);
  expect(service.unexpected).toEqual([]);
});

test('employee read reminders remain pending, persist on reload and renew after a saved resend', async ({ page }, testInfo) => {
  const service = await backend(page, 'Employee');
  const record = { record_type: 'survey', record_id: evaluationForm.id, payload: { ...evaluationForm }, created_at: createdAt };
  service.records.push(record);
  await page.goto('/login');
  await signIn(page, 'Employee');
  await expect(page).toHaveURL(/\/dashboard$/);
  const bell = page.getByRole('button', { name: 'Pending Survey Reminders', exact: true });
  await bell.click();
  await expect(page.getByText('1 unread', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /REMINDER - Survey Accomplishment/ }).click();
  await expect(page.getByText('This in-app reminder remains available', { exact: false })).toBeVisible();
  await page.keyboard.press('Escape');
  await bell.click();
  await expect(page.getByText('0 unread', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic evaluation (1 pending)', { exact: true })).toBeVisible();
  await expect(page.getByText('No pending surveys', { exact: true })).toHaveCount(0);
  const bounds = await page.locator('#btn-employee-bell + div').boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: testInfo.outputPath('employee-read-reminders.png') });
  await page.reload();
  await bell.click();
  await expect(page.getByText('0 unread', { exact: true })).toBeVisible();
  Object.assign(record.payload, { distributionId: 'saved-resend', lastDistributedAt: '2026-10-23T02:00:00Z' });
  await page.reload();
  await bell.click();
  await expect(page.getByText('1 unread', { exact: true })).toBeVisible();
  expect(service.records.find(row => row.record_type === 'employee_notification_state')?.payload.readIds).toContain('reminder-synthetic-form');
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
});

test('Admin sends and resends explicitly; rejected persistence does not publish a distribution', async ({ page }, testInfo) => {
  const service = await backend(page);
  service.profiles.push({ ...service.profiles[0], email: 'synthetic.employee@mgenesis.com', role: 'Employee' });
  service.records[0].payload.type = 'Subcontractor';
  const record = { record_type: 'survey', record_id: evaluationForm.id, payload: { ...evaluationForm, surveyType: 'Subcontractor', status: 'Paused' }, created_at: createdAt };
  service.records.push(record);
  await page.goto('/login');
  await signIn(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/evaluation-workspace');
  await page.getByTitle('Preview and send form', { exact: true }).click();
  await page.getByRole('button', { name: 'Send Form', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Confirm form distribution' });
  await expect(review).toContainText('1 eligible employee');
  await review.getByRole('button', { name: 'Confirm & Make Available' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Proceed with sending?' });
  await page.screenshot({ path: testInfo.outputPath('admin-send-confirmation.png') });
  service.failures.surveyWrites = true;
  await confirmation.getByRole('button', { name: 'Yes, proceed' }).click();
  await expect(confirmation.getByRole('alert')).toContainText('Synthetic survey write rejected');
  expect(record.payload.status).toBe('Paused');
  expect(record.payload).not.toHaveProperty('distributionId');
  service.failures.surveyWrites = false;
  await confirmation.getByRole('button', { name: 'Yes, proceed' }).click();
  await expect(confirmation).toHaveCount(0);
  const first = service.records.find(row => row.record_type === 'survey')!.payload.distributionId;
  expect(first).toEqual(expect.any(String));
  await page.getByRole('button', { name: 'Send Form', exact: true }).click();
  await review.getByRole('button', { name: 'Confirm & Resend' }).click();
  await confirmation.getByRole('button', { name: 'Yes, proceed' }).click();
  await expect(confirmation).toHaveCount(0);
  expect(service.records.find(row => row.record_type === 'survey')!.payload.distributionId).not.toBe(first);
  service.records.push({ record_type: 'survey_response', record_id: 'remote-submission:Q1', created_at: createdAt,
    payload: { responseId: 'remote-submission', surveyId: evaluationForm.id, companyId: 'synthetic-courier', company: 'Synthetic Courier',
      surveyType: 'Subcontractor', respondentType: 'Employee', submissionDate: '2026-10-23T02:00:00Z',
      questionId: 'Q1', questionNumber: 1, question: 'Quality?', questionCategory: 'Quality', rating: 0, comment: '' } });
  await page.goto('/notifications');
  await page.getByRole('button', { name: 'Mark as read: Synthetic Courier', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mark as unread: Synthetic Courier', exact: true })).toBeVisible();
  await expect(page.getByText('Unavailable', { exact: true }).first()).toBeVisible();
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
});

test('Courier feedback card opens a readable progress dialog and dismisses without completing', async ({ page }, testInfo) => {
  const service = await backend(page);
  service.records.push({ record_type: 'partner_company', record_id: 'courier-two', created_at: createdAt,
    payload: { id: 'courier-two', name: 'Second Synthetic Courier', type: 'Courier', createdAt } });
  const form = { ...evaluationForm, title: 'Courier Satisfaction Survey' };
  service.records.push({ record_type: 'survey', record_id: form.id, payload: form, created_at: createdAt });
  for (let index = 0; index < 8; index++) {
    const employeeEmail = `synthetic.employee-${index}@mgenesis.com`;
    service.profiles.push({ ...service.profiles[0], email: employeeEmail, role: 'Employee' });
    if (index < 2) service.records.push({ record_type: 'survey_response', record_id: `progress-${index}:Q01`, created_at: createdAt,
      payload: { responseId: `progress-${index}`, surveyId: form.id, companyId: 'synthetic-courier', company: 'Synthetic Courier',
        surveyType: 'Courier', respondentEmail: employeeEmail, respondentType: 'Rank & File', department: 'TASS',
        submissionDate: '2026-10-23T02:00:00Z', questionId: 'Q01', questionNumber: 1,
        question: 'Reliability?', questionCategory: 'Reliability/Delivery', rating: 15, comment: '' } });
  }
  await page.goto('/login');
  await signIn(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/feedback-hub');
  const card = page.getByRole('button', { name: 'Courier Satisfaction Survey, Courier, Ongoing. View details', exact: true });
  await card.click();
  const dialog = page.getByRole('dialog', { name: 'Courier Satisfaction Survey', exact: true });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await dialog.getByRole('heading', { name: 'Courier Satisfaction Survey', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('table', { name: 'Employee evaluation completion' })).toBeVisible();
  await expect(dialog.getByText('0 of 8 employees complete', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('progressbar', { name: 'Evaluations completed by synthetic.employee-0@mgenesis.com', exact: true })).toHaveAttribute('value', '1');
  const body = dialog.getByRole('region', { name: 'Survey progress details' });
  expect(await body.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const backdrop = await page.locator('.feedback-modal-backdrop').boundingBox();
  expect(backdrop!.y).toBe(0);
  expect(backdrop!.height).toBe(page.viewportSize()!.height);
  await page.screenshot({ path: testInfo.outputPath('courier-progress.png') });
  await dialog.getByRole('table', { name: 'Recorded respondents', exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: 'Complete survey', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(card).toBeFocused();
  await card.click();
  await page.mouse.click(2, 2);
  await expect(dialog).toHaveCount(0);
  expect(service.records.find(record => record.record_id === form.id)?.payload.status).toBe('Running');
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
});
