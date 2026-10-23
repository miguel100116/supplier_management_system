import { test, expect, type Page } from '@playwright/test';

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
  const failures = { surveyWrites: false };
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
        const rows = records.filter(record => record.record_type === type).slice(offset, offset + limit);
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
  return { records, unexpected, errors, failures, profiles };
}

async function signIn(page: Page, audience: 'Admin' | 'Employee' = 'Admin') {
  await page.getByRole('button', { name: `${audience} Account`, exact: true }).click();
  await page.getByRole('textbox', { name: 'Company email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Synthetic-password-123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
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
  await expect(rows).toHaveCount(3);
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
