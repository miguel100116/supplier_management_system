import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';

const email = 'synthetic.admin@mgenesis.com';
const userId = '00000000-0000-4000-8000-000000000001';
const createdAt = '2026-01-01T00:00:00.000Z';

test('Master List import previews active lists, cancels safely, retries failures and replaces category scopes', async ({ page }, testInfo) => {
  const service = await backend(page);
  const header: string[] = []; header[0] = '#'; header[5] = 'Status'; header[6] = 'Category'; header[8] = 'BP Code'; header[9] = 'BP Name';
  const sheet = XLSX.utils.aoa_to_sheet([header, ...[
    ['NEW', 'Imported Supplier', 'Pending', 'Supplier-Local'],
    ['OLD', 'Inactive Supplier', 'Inactive', 'Supplier-Local'],
    ['SKIP', 'Skipped Subcontractor', 'Accredited', 'Subcontructor'],
  ].map(([code, name, status, category], i) => {
    const row: string[] = []; row[0] = String(i + 1); row[5] = status; row[6] = category; row[8] = code; row[9] = name; return row;
  })]);
  const file = { name: 'synthetic-master.csv', mimeType: 'text/csv', buffer: Buffer.from(XLSX.utils.sheet_to_csv(sheet)) };
  service.records.push({ record_type: 'active_company_snapshot', record_id: 'old-supplier-list', created_at: createdAt,
    payload: { id: 'old-supplier-list', surveyType: 'Supplier', companies: ['Previous Supplier'], uploadedAt: createdAt, uploadedBy: email, sourceFileName: 'old.csv' } });
  const importRecords = () => service.records.filter(record => record.record_type === 'partner_company' || record.record_type === 'active_company_snapshot');
  const before = structuredClone(importRecords());
  await page.goto('/'); await signIn(page);
  await openReadyPage(page, '/partner-companies');
  const upload = async (selectedFile = file, replace = false) => {
    await page.getByRole('button', { name: /Register.*Partner/i }).click();
    await page.getByRole('button', { name: 'Upload Master List', exact: true }).click();
    if (replace) await page.getByRole('checkbox', { name: /Replace the entire registry/ }).check();
    await page.locator('input[type=file][multiple]').setInputFiles(selectedFile);
    await expect(page.getByRole('heading', { name: 'Review Master List Import' })).toBeVisible();
  };
  await upload();
  await page.getByRole('checkbox', { name: 'Skip Skipped Subcontractor', exact: true }).check();
  await expect(page.getByLabel('Resulting active company counts')).toHaveText('Courier: 1 · Supplier: 1 · Subcontractor: 0');
  await page.screenshot({ path: testInfo.outputPath('master-list-active-preview.png'), fullPage: true });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(importRecords()).toEqual(before);
  await upload();
  await page.getByRole('checkbox', { name: 'Skip Skipped Subcontractor', exact: true }).check();
  service.failures.masterListWrites = true;
  await page.getByRole('button', { name: 'Apply Update', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Review Master List Import' }).getByRole('alert').filter({ hasText: 'Synthetic master-list write rejected' })).toBeVisible();
  expect(importRecords()).toEqual(before);
  service.failures.masterListWrites = false;
  await page.getByRole('button', { name: 'Apply Update', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Master List Import Complete' })).toBeVisible();
  const snapshots = service.records.filter(record => record.record_type === 'active_company_snapshot');
  expect(snapshots).toHaveLength(4);
  expect(snapshots.filter(record => record.record_id !== 'old-supplier-list').map(record => [record.payload.surveyType, record.payload.companies])).toEqual([
    ['Courier', ['Synthetic Courier']], ['Supplier', ['Imported Supplier']], ['Subcontractor', []],
  ]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Active Companies by Type/ }).click();
  await expect(page.getByRole('dialog', { name: 'Active Companies by Type' }).getByText('Imported Supplier', { exact: true })).toBeVisible();
  await expect(page.getByText('No eligible active companies in the latest list.', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('master-list-active-saved.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Partner directory' })).toBeVisible();
  await page.getByRole('button', { name: /Active Companies by Type/ }).click();
  await expect(page.getByRole('dialog').getByText('Imported Supplier', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  const replacement = { ...file, name: 'inactive-only.csv', buffer: Buffer.from(XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet([
    header, ['1', '', '', '', '', 'Inactive', 'Supplier-Local', '', 'INACTIVE', 'Replacement Supplier'],
  ]))) };
  await upload(replacement, true);
  await expect(page.getByLabel('Resulting active company counts')).toHaveText('Courier: 0 · Supplier: 0 · Subcontractor: 0');
  const beforeReplace = structuredClone(importRecords());
  await page.getByRole('button', { name: 'Apply Update', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: 'Replace the entire partner registry?' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(importRecords()).toEqual(beforeReplace);
  await expect(page.getByRole('heading', { name: 'Review Master List Import' })).toBeVisible();
  await page.getByRole('button', { name: 'Apply Update', exact: true }).click();
  await page.getByRole('button', { name: 'Replace Registry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Master List Import Complete' })).toBeVisible();
  expect(service.records.filter(record => record.record_type === 'partner_company').map(record => record.payload.name)).toEqual(['Replacement Supplier']);
  expect(service.activeLists.value?.map(list => list.companies)).toEqual([[], [], []]);
  expect(service.records.filter(record => record.record_type === 'active_company_snapshot')).toHaveLength(7);
  expect(service.unexpected).toEqual([]); expect(service.errors).toEqual([]);
});

test('Manage Access saves a complete Courier selection and preserves drafts after rejected writes', async ({ page, browser }, testInfo) => {
  const service = await backend(page);
  const names = Array.from({ length: 7 }, (_, i) => `Assigned Courier ${i + 1}`);
  service.records.push(...names.map((name, i) => ({ record_type: 'partner_company', record_id: `assigned-${i}`, created_at: createdAt,
    payload: { id: `assigned-${i}`, name, type: 'Courier', createdAt, isArchived: false } })));
  service.activeLists.value = [{ survey_type: 'Courier', companies: names }];
  service.records.push({ record_type: 'survey', record_id: evaluationForm.id, payload: { ...evaluationForm }, created_at: createdAt });
  await page.goto('/'); await signIn(page);
  await openReadyPage(page, '/evaluation-workspace');
  await page.getByRole('button', { name: 'Manage Access', exact: true }).click();
  await page.getByRole('button').filter({ hasText: 'Synthetic evaluation' }).last().click();
  await page.getByRole('button', { name: /Modify Companies to Evaluate/ }).click();
  for (const name of names) await expect(page.getByRole('checkbox', { name, exact: true })).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath('manage-access-companies.png') });
  await page.getByRole('checkbox', { name: names[6], exact: true }).uncheck();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  service.failures.surveyWrites = true;
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(page.getByText('Unable to save survey records: Synthetic survey write rejected', { exact: true })).toBeVisible();
  expect(service.records.find(row => row.record_type === 'survey')!.payload).not.toHaveProperty('evaluationCompanyIds');
  service.failures.surveyWrites = false;
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect.poll(() => service.records.find(row => row.record_type === 'survey')!.payload.evaluationCompanyIds).toHaveLength(6);
  await openReadyPage(page, '/evaluation-workspace');
  await page.getByRole('button', { name: 'Manage Access', exact: true }).click();
  await page.getByRole('button').filter({ hasText: 'Synthetic evaluation' }).last().click();
  await page.getByRole('button', { name: /Modify Companies to Evaluate/ }).click();
  await expect(page.getByRole('checkbox', { name: names[6], exact: true })).not.toBeChecked();
  const employeeContext = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  try {
    const employeePage = await employeeContext.newPage();
    const employeeService = await backend(employeePage, 'Employee', false, { records: service.records });
    employeeService.activeLists.value = service.activeLists.value;
    await employeePage.goto('/'); await signIn(employeePage, 'Employee');
    await expect(employeePage.getByRole('button', { name: 'Courier: 6 pending', exact: true })).toBeVisible();
    await employeePage.reload();
    await expect(employeePage.getByRole('button', { name: 'Courier: 6 pending', exact: true })).toBeVisible();
  } finally { await employeeContext.close(); }
});

test('Directory registration types save, reload and edit their BP branches', async ({ page }, testInfo) => {
  const service = await backend(page);
  await page.goto('/'); await signIn(page);
  await openReadyPage(page, '/partner-companies');
  await page.getByRole('button', { name: /Register.*Partner/i }).click();
  await page.locator('#modal-reg-name').fill('Registration Test Partner');
  await expect(page.locator('#modal-reg-ntbpcode')).toHaveCount(0);
  await page.locator('#registration-type').selectOption('Non-Trade');
  await expect(page.locator('#modal-reg-bpcode')).toHaveCount(0);
  await expect(page.locator('#modal-reg-ntbpcode')).toHaveAttribute('required', '');
  await page.locator('#modal-reg-ntbpcode').fill('REG-NT');
  await page.locator('#registration-type').selectOption('Both');
  await page.locator('#modal-reg-bpcode').fill('REG');
  await page.screenshot({ path: testInfo.outputPath('registration-form.png') });
  await page.getByRole('button', { name: 'Register Company', exact: true }).click();
  await expect.poll(() => service.records.find((row) => row.payload.name === 'Registration Test Partner')?.payload.registrationType).toBe('Both');
  await openReadyPage(page, '/partner-companies');
  await page.getByText('Registration Test Partner', { exact: true }).filter({ visible: true }).first().click();
  const editor = page.locator('form').filter({ has: page.getByRole('button', { name: 'Save registration' }) });
  await expect(editor.getByLabel('Registration type')).toHaveValue('Both');
  await expect(editor.getByLabel('Trade BP Code', { exact: true })).toHaveValue('REG');
  await expect(editor.getByLabel('Non-Trade (NT) BP Code')).toHaveValue('REG-NT');
  await editor.getByLabel('Non-Trade (NT) BP Code').fill('REG-UPDATED');
  page.once('dialog', async (dialog) => dialog.dismiss());
  await page.keyboard.press('Escape');
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Non-Trade (NT) BP Code')).toHaveValue('REG-UPDATED');
  await page.screenshot({ path: testInfo.outputPath('registration-edit.png') });
  await editor.getByRole('button', { name: 'Save registration' }).click();
  await expect.poll(() => JSON.stringify(service.records.find((row) => row.payload.name === 'Registration Test Partner')?.payload.branches)).toContain('REG-UPDATED');
});
type SyntheticRecord = { record_type: string; record_id: string; payload: Record<string, unknown>; created_at: string };

// Only the external identity/data service is mocked; the built app and Express host run normally.
async function backend(page: Page, role: 'Admin' | 'Employee' = 'Admin', rejectPassword = false,
  shared: { records?: SyntheticRecord[]; onWrite?: (record: SyntheticRecord) => void } = {}) {
  const profile = { email, user_id: userId, role, designation: 'Rank & File', department: 'TASS' };
  const profiles = [profile];
  const user = { id: userId, email, email_confirmed_at: createdAt, aud: 'authenticated',
    role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: createdAt };
  const company = { id: 'synthetic-courier', name: 'Synthetic Courier', type: 'Courier',
    createdAt, branches: [], isArchived: false };
  const records: SyntheticRecord[] = shared.records ?? [
    { record_type: 'partner_company', record_id: company.id, payload: company, created_at: createdAt },
    { record_type: 'document_maintenance', record_id: 'default', created_at: createdAt,
      payload: { id: 'default', validityYears: {}, reminderDays: [60, 30], dailyFinalDays: 30 } },
  ];
  const unexpected: string[] = [];
  const errors: string[] = [];
  const failures = { surveyWrites: false, historyBulkReads: false, historyFileReads: false, reminderReads: false, activeListReads: false, masterListWrites: false };
  const activeLists: { value: Array<{ survey_type: string; companies: string[] }> | null } = { value: null };
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
    if (url.pathname === '/rest/v1/rpc/import_partner_master_list') {
      if (role !== 'Admin') return reply({ message: 'Admin required' }, 403);
      if (failures.masterListWrites) return reply({ message: 'Synthetic master-list write rejected' }, 500);
      const body = request.postDataJSON();
      const snapshots = ['Courier', 'Supplier', 'Subcontractor'].map(type => {
        const id = `${type}-master-list-${crypto.randomUUID()}`;
        return { id, surveyType: type, uploadedAt: new Date().toISOString(), uploadedBy: email, sourceFileName: body.p_source_file_name,
          companies: body.p_companies.filter((company: { type: string; isArchived?: boolean; branches: Array<{ status?: string }> }) => company.type === type && !company.isArchived
            && (!company.branches.length || company.branches.some(branch => branch.status !== 'Inactive'))).map((company: { name: string }) => company.name).sort() };
      });
      for (let i = records.length - 1; i >= 0; i--) if (records[i].record_type === 'partner_company') records.splice(i, 1);
      records.push(...body.p_companies.map((company: { id: string }) => ({ record_type: 'partner_company', record_id: company.id, payload: company, created_at: createdAt })),
        ...snapshots.map(snapshot => ({ record_type: 'active_company_snapshot', record_id: snapshot.id, payload: snapshot, created_at: createdAt })));
      activeLists.value = snapshots.map(snapshot => ({ survey_type: snapshot.surveyType, companies: snapshot.companies }));
      return reply({ companies: body.p_companies, snapshots });
    }
    if (url.pathname === '/rest/v1/rpc/get_active_evaluation_lists') {
      if (failures.activeListReads) return reply({ message: 'Synthetic active-list failure' }, 500);
      // Existing fixtures supply all their synthetic partners as the uploaded
      // list. Scope regressions below explicitly supply a smaller/empty list.
      return reply(activeLists.value ?? ['Courier', 'Supplier', 'Subcontractor'].map(type => ({
        survey_type: type,
        companies: records.filter(record => record.record_type === 'partner_company' && record.payload.type === type && !record.payload.isArchived).map(record => String(record.payload.name)),
      })));
    }
    if (url.pathname === '/rest/v1/app_profiles' && request.method() === 'GET') {
      const requestedEmail = url.searchParams.get('email')?.replace(/^eq\./, '');
      const matches = requestedEmail ? profiles.filter(item => item.email === requestedEmail) : profiles;
      return reply(request.headers().accept?.includes('object+json') ? matches[0] ?? null : matches);
    }
    if (url.pathname === '/rest/v1/application_records') {
      if (request.method() === 'GET') {
        const type = url.searchParams.get('record_type')?.replace(/^eq\./, '');
        if (type === 'document_reminder_delivery' && failures.reminderReads) return reply({ message: 'Synthetic reminder read failed' }, 500);
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
          shared.onWrite?.(saved);
        }
        return reply([]);
      }
    }
    unexpected.push(`${request.method()} ${url.pathname}`);
    return route.abort();
  });
  return { records, unexpected, errors, failures, profiles, historyReads, activeLists };
}

async function signIn(page: Page, audience: 'Admin' | 'Employee' = 'Admin') {
  // Both roles use the same verified login form.
  await page.getByRole('textbox', { name: 'Company email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Synthetic-password-123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // Let authentication settle before the next navigation can interrupt it.
  const authenticationResult = page.getByRole('main').or(page.getByRole('alert')).first();
  await authenticationResult.waitFor({ state: 'visible' });
  await expect(authenticationResult).toBeVisible();
}

async function openReadyPage(page: Page, path: string) {
  await page.goto(path);
  await waitForReadyPage(page);
}

async function waitForReadyPage(page: Page) {
  const main = page.getByRole('main');
  await main.waitFor({ state: 'visible' });
  // Route and Realtime loaders can overlap; wait until all are hidden.
  await expect(main.getByRole('status').filter({ hasText: /Loading page|Refreshing shared data/ }).filter({ visible: true })).toHaveCount(0, { timeout: 30_000 });
}

test('Stored source files separate segmented status navigation from underlined category filters', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const service = await backend(page);
  for (const type of ['Courier', 'Supplier', 'Subcontractor']) {
    const id = `source-${type}`;
    service.records.push({ record_type: 'survey', record_id: `default-${type.toLowerCase()}`, created_at: createdAt,
      payload: { id: `default-${type.toLowerCase()}`, title: `${type} evaluation`, description: 'Synthetic form.', surveyType: type, createdAt, status: 'Running', deadlineDate: '31/12/2099', questions: [] } });
    service.records.push({ record_type: 'evaluation_import_archive', record_id: id, created_at: createdAt,
      payload: { id, surveyType: type, uploadedAt: createdAt, uploadedBy: email, sourceFileName: `Microgenesis ${type} Evaluation Form.csv`, storagePath: `${type.toLowerCase()}/${id}.csv`, contentType: 'text/csv', fileSize: 100, importBatchId: id } });
  }
  service.records.push({ record_type: 'evaluation_import_archive', record_id: 'source-history', created_at: createdAt,
    payload: { id: 'source-history', surveyType: 'Supplier', uploadedAt: createdAt, uploadedBy: email, sourceFileName: 'Older Supplier.csv', storagePath: 'supplier/history.csv', contentType: 'text/csv', fileSize: 100, importBatchId: 'older', importStatus: 'historical', historicalStatus: 'Archived' } });
  const sources = structuredClone(service.records.filter(record => record.record_type === 'evaluation_import_archive'));
  await page.goto('/login');
  await signIn(page);
  await openReadyPage(page, '/import-evaluation-responses');
  const files = page.getByRole('region', { name: 'Stored Source Files', exact: true });
  const statuses = files.getByRole('navigation', { name: 'Filter stored source files by import status' });
  const categories = files.getByRole('group', { name: 'Filter stored source files by category' });
  for (const width of [1440, 768, 393, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const active = statuses.getByRole('button', { name: 'Active Imports (3)', exact: true });
    const history = statuses.getByRole('button', { name: 'Import History (1)', exact: true });
    await active.click();
    await categories.getByRole('button', { name: 'All categories', exact: true }).click();
    await expect(files.getByRole('checkbox', { name: /^Select Microgenesis/ })).toHaveCount(3);
    await expect(active).toHaveAttribute('aria-pressed', 'true');
    await expect(active).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(active).toHaveCSS('border-bottom-width', '0px');
    await expect(active).toHaveCSS('font-size', '12px');
    expect(await statuses.evaluate(element => getComputedStyle(element).borderRadius)).not.toBe('0px');
    const category = categories.getByRole('button', { name: 'Courier', exact: true });
    await category.click();
    await expect(files.getByRole('checkbox', { name: /^Select Microgenesis/ })).toHaveCount(1);
    await files.getByRole('checkbox', { name: 'Select Microgenesis Courier Evaluation Form.csv', exact: true }).check();
    expect(await category.evaluate(element => parseFloat(getComputedStyle(element).borderBottomWidth))).toBeGreaterThan(0);
    await history.scrollIntoViewIfNeeded();
    await history.click();
    await expect(history).toHaveAttribute('aria-pressed', 'true');
    await expect(files.getByText('No files match the selected filter.', { exact: true })).toBeVisible();
    await categories.getByRole('button', { name: 'Supplier', exact: true }).click();
    await expect(files.getByText('Older Supplier.csv', { exact: true })).toBeVisible();
    await active.click();
    await expect(files.getByRole('checkbox', { name: 'Select Microgenesis Supplier Evaluation Form.csv', exact: true })).not.toBeChecked();
    await categories.getByRole('button', { name: 'All categories', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await files.locator(':scope > div').first().screenshot({ path: testInfo.outputPath(`stored-source-navigation-${width}.png`), animations: 'disabled' });
  }
  await page.locator('html').evaluate(element => element.classList.add('dark'));
  await files.locator(':scope > div').first().screenshot({ path: testInfo.outputPath('stored-source-navigation-dark.png'), animations: 'disabled' });
  expect(service.records.filter(record => record.record_type === 'evaluation_import_archive')).toEqual(sources);
  expect(service.errors).toEqual([]);
});

test('Supplier Local attention containers filter only the expanded company and toggle back to all', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const service = await backend(page);
  const currentDocuments = Object.fromEntries([
    'Confidentiality and Non-Disclosure Agreement', 'Letter of Accreditation', 'Supplier Code of Business Conduct and Ethics',
    'SIF', 'BIR2303', 'SEC (Corp)', 'Articles of Incorporation', 'AFS', 'GIS (Corp)', 'Business Permit', 'Import Permit',
    'Product Profile', 'Proof of Present Address', "Sole Proprietorship (Owner's ID)", 'Other Documents',
  ].map(name => [name, { provided: true, expiryDate: '2099-12-31' }]));
  const documents = { ...currentDocuments };
  for (const name of ['SIF', 'BIR2303', 'Articles of Incorporation', 'Product Profile']) documents[name] = { provided: false, expiryDate: '2099-12-31' };
  documents['Business Permit'] = { provided: true, expiryDate: '2000-01-01' };
  documents.AFS = { provided: true, expiryDate: '2000-01-01' };
  documents['Import Permit'] = { provided: true, expiryDate: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10) };
  documents['DTI (Sole)'] = { provided: true, expiryDate: '2000-01-01' };
  Object.assign(documents.SIF, { remarks: 'Awaiting the updated supplier form.' });
  for (const [id, name, branchDocuments] of [
    ['local-one', 'First Local Supplier', documents],
    ['local-two', 'Second Local Supplier', { ...currentDocuments, SIF: { provided: false, expiryDate: '2099-12-31' } }],
  ] as const) {
    service.records.push({ record_type: 'partner_company', record_id: id, created_at: createdAt,
      payload: { id, name, type: 'Supplier', supplierOrigin: 'Local', businessClassification: 'CORP', createdAt,
        branches: [{ id: `${id}-branch`, bpCode: id.toUpperCase(), status: 'Accredited', documents: branchDocuments }] } });
  }
  const originalPartners = JSON.stringify(service.records.filter(record => record.record_type === 'partner_company'));
  await page.goto('/login');
  await signIn(page);
  await openReadyPage(page, '/document-tracker?category=supplier-local');
  const company = page.getByRole('article').filter({ hasText: 'First Local Supplier' });
  const required = company.getByRole('region', { name: 'Required documents', exact: true });
  const expandTrigger = () => company.getByRole('button').first();
  await company.getByText('First Local Supplier', { exact: true }).hover();
  await expect(required).toBeHidden();
  await expandTrigger().hover();
  await expect(required).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(required).toBeVisible();
  await expandTrigger().hover();
  await expect(required).toBeHidden();
  const openFirst = () => expandTrigger().click();
  await openFirst();
  const attention = company.getByLabel('Required document attention summary', { exact: true });
  const missing = attention.getByRole('button', { name: '4 missing', exact: true });
  const expired = attention.getByRole('button', { name: '1 expired', exact: true });
  const forUpdate = attention.getByRole('button', { name: '1 for update', exact: true });
  const summary = await attention.textContent() ?? '';
  const checkScope = async (count: number, showHistory = count === 14) => {
    await expect(required.getByRole('listitem')).toHaveCount(count);
    await expect(attention).toHaveText(summary);
    if (showHistory) {
      const cards = (await company.getByRole('listitem').allTextContents()).join('\n');
      expect(cards).not.toContain('DTI (Sole)');
      expect(cards).not.toContain("Sole Proprietorship (Owner's ID)");
    }
    for (const control of [missing, expired, forUpdate]) {
      const box = await control.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
  };
  await checkScope(14, true);
  await missing.click();
  await expect(missing).toHaveAttribute('aria-pressed', 'true');
  await expect(missing.locator('svg.lucide-x')).toBeVisible();
  await expect(expired.locator('svg.lucide-x')).toHaveCount(0);
  await checkScope(4, false);
  await expect(required.getByRole('listitem')).toHaveText([/SIF.*Missing/, /BIR2303.*Missing/, /Articles of Incorporation.*Missing/, /Product Profile.*Missing/]);
  await expect(required.getByRole('heading')).toHaveText('Required documents4 / 14');
  const sifCard = required.getByRole('listitem').filter({ has: page.getByText('SIF', { exact: true }) });
  const actionsBox = await sifCard.getByRole('button', { name: 'Actions for SIF', exact: true }).boundingBox();
  const remarksBox = await sifCard.getByRole('button', { name: 'View admin remarks for SIF', exact: true }).boundingBox();
  const cardBox = await sifCard.boundingBox();
  expect(remarksBox!.y).toBeGreaterThanOrEqual(actionsBox!.y + actionsBox!.height);
  expect(remarksBox!.x).toBe(actionsBox!.x);
  expect(remarksBox!.y + remarksBox!.height).toBeLessThanOrEqual(cardBox!.y + cardBox!.height);
  await sifCard.screenshot({ path: testInfo.outputPath('document-remarks-bottom-right.png'), animations: 'disabled' });
  await attention.screenshot({ path: testInfo.outputPath('required-attention-missing.png'), animations: 'disabled' });
  await expired.click();
  await expect(missing).toHaveAttribute('aria-pressed', 'false');
  await expect(expired).toHaveAttribute('aria-pressed', 'true');
  await expect(expired.locator('svg.lucide-x')).toBeVisible();
  await expect(missing.locator('svg.lucide-x')).toHaveCount(0);
  await checkScope(1, false);
  await expect(required.getByRole('listitem')).toContainText('Business Permit');
  await forUpdate.focus();
  await page.keyboard.press('Enter');
  await expect(forUpdate).toBeFocused();
  await expect(forUpdate).toHaveAttribute('aria-pressed', 'true');
  await expect(forUpdate.locator('svg.lucide-x')).toBeVisible();
  await expect(expired).toHaveAttribute('aria-pressed', 'false');
  await checkScope(1, false);
  await expect(required.getByRole('listitem')).toContainText('AFS');
  await page.evaluate(() => document.body.classList.add('dark'));
  await attention.screenshot({ path: testInfo.outputPath('required-attention-for-update-dark.png'), animations: 'disabled' });
  await page.evaluate(() => document.body.classList.remove('dark'));
  await page.keyboard.press('Space');
  await expect(forUpdate).toHaveAttribute('aria-pressed', 'false');
  await expect(forUpdate.locator('svg.lucide-x')).toHaveCount(0);
  await checkScope(14, true);
  await expired.click();
  await checkScope(1, false);
  await page.getByRole('button', { name: 'Review documents for Second Local Supplier (LOCAL-TWO)', exact: true }).first().click();
  const second = page.getByRole('region', { name: 'Required documents', exact: true });
  await expect(second.getByRole('listitem')).toHaveCount(14);
  await expect(page.getByRole('button', { name: '1 missing', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await openFirst();
  await checkScope(14, true);
  await expect(expired).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Hide documents for First Local Supplier (LOCAL-ONE)', exact: true }).first().click();
  await openFirst();
  await checkScope(14, true);
  expect(JSON.stringify(service.records.filter(record => record.record_type === 'partner_company'))).toBe(originalPartners);
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
});

test('local registration cards render only applicable documents and hide excluded history', async ({ page }) => {
  const allDocuments = Object.fromEntries([
    'Confidentiality and Non-Disclosure Agreement', 'Letter of Accreditation', 'Supplier Code of Business Conduct and Ethics',
    'SIF', 'BIR2303', 'SEC (Corp)', 'Articles of Incorporation', 'AFS', 'GIS (Corp)', 'DTI (Sole)', 'Business Permit',
    'Import Permit', 'Product Profile', 'Proof of Present Address', "Sole Proprietorship (Owner's ID)", 'Other Documents',
  ].map(name => [name, { provided: true, expiryDate: '2099-12-31' }]));
  const service = await backend(page, 'Admin', false, { records: [
    { record_type: 'document_maintenance', record_id: 'default', created_at: createdAt, payload: { id: 'default', validityYears: {}, reminderDays: [60, 30], dailyFinalDays: 30 } },
    ...(['CORP', 'SOL'] as const).map(classification => ({
      record_type: 'partner_company', record_id: `classification-${classification}`, created_at: createdAt,
      payload: { id: `classification-${classification}`, name: `Classification ${classification}`, type: 'Supplier', supplierOrigin: 'Local', businessClassification: classification, createdAt,
        branches: [{ id: `branch-${classification}`, bpCode: classification, status: 'Accredited', documents: allDocuments }] },
    })),
  ] });
  await page.goto('/login');
  await signIn(page);
  await openReadyPage(page, '/document-tracker?category=supplier-local');

  for (const [classification, included, excluded] of [
    ['CORP', ['GIS (Corp)', 'SEC (Corp)', 'Articles of Incorporation'], ['DTI (Sole)', "Sole Proprietorship (Owner's ID)"]],
    ['SOL', ['DTI (Sole)', "Sole Proprietorship (Owner's ID)"], ['GIS (Corp)', 'SEC (Corp)', 'Articles of Incorporation']],
  ] as const) {
    const name = `Classification ${classification}`;
    const company = page.getByRole('article').filter({ has: page.getByRole('button', { name: new RegExp(`(Review|Hide) documents for ${name}`) }) });
    await company.getByRole('button', { name: new RegExp(`Review documents for ${name}`) }).first().click();
    const required = company.getByRole('region', { name: 'Required documents', exact: true });
    for (const documentName of included) await expect(company.getByRole('button', { name: `Actions for ${documentName}`, exact: true })).toBeVisible();
    const allCardText = await company.innerText();
    for (const documentName of excluded) {
      expect(allCardText).not.toContain(documentName);
      await expect(company.getByRole('button', { name: `Actions for ${documentName}`, exact: true })).toHaveCount(0);
    }
    await expect(required.getByRole('listitem')).toHaveCount(classification === 'CORP' ? 14 : 13);
    const actionButtons = required.getByRole('button', { name: /^Actions for / });
    await expect(actionButtons).toHaveCount(classification === 'CORP' ? 14 : 13);
    for (const action of await actionButtons.all()) await expect(action).toBeEnabled();
  }
  expect(service.errors).toEqual([]);
  expect(service.unexpected).toEqual([]);
});

test('Document reminder failures and missing setup stay visible and recover through Retry', async ({ page }) => {
  const api = await backend(page);
  const seed = api.records.splice(api.records.findIndex(row => row.record_type === 'document_maintenance'), 1)[0];
  await page.goto('/');
  await signIn(page);
  const warning = page.getByRole('alert').filter({ hasText: 'Document reminders could not be refreshed' });
  await expect(warning).toContainText('202610280001 and 202610290001');
  api.records.push(seed);
  api.failures.reminderReads = true;
  await warning.getByRole('button', { name: 'Retry reminders' }).click();
  await expect(warning).toContainText('Synthetic reminder read failed');
  api.failures.reminderReads = false;
  await warning.getByRole('button', { name: 'Retry reminders' }).click();
  await expect(warning).toHaveCount(0);
  expect(api.errors).toEqual([]);
});

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
  const toolbar = page.getByRole('toolbar', { name: 'Survey forms controls' });
  await expect(toolbar.getByRole('group', { name: 'Survey category' })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Category Type' })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) > 760) {
    const searchBox = await toolbar.getByRole('searchbox', { name: 'Search survey forms' }).boundingBox();
    for (const name of ['Create Form', 'Manage Access', 'Sort forms', 'Filter forms by deadline date']) {
      const control = await toolbar.getByRole('button', { name }).boundingBox();
      expect(Math.abs(control!.y - searchBox!.y)).toBeLessThan(3);
    }
  } else {
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  }
  await toolbar.getByRole('searchbox', { name: 'Search survey forms' }).fill('Supplier');
  await expect(rows).toHaveCount(1);
  await toolbar.getByRole('searchbox', { name: 'Search survey forms' }).fill('');
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
      expect(badges.category.size).toBe('10px');
      const box = await row.getByRole('cell').nth(1).locator('span').boundingBox();
      const cell = await row.getByRole('cell').nth(1).boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(cell!.x + cell!.width);
    }
  }
  for (const label of ['ACTIVE', 'PAUSED', 'ENDED']) await expect(rows.getByText(label, { exact: true })).toBeVisible();
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
});

test('Responses workspace keeps long submission data readable and filters removable', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const service = await backend(page);
  const title = 'Courier satisfaction evaluation with a long form title';
  const form = { id: 'default-courier', title, surveyType: 'Courier', status: 'Running',
    description: 'Synthetic form.', createdAt, questions: [] };
  service.records.push({ record_type: 'survey', record_id: form.id, payload: form, created_at: createdAt });
  for (const surveyType of ['Supplier', 'Subcontractor'] as const) {
    const otherForm = { ...form, id: `responses-layout-${surveyType}`, title: `${surveyType} evaluation`, surveyType };
    service.records.push({ record_type: 'survey', record_id: otherForm.id, payload: otherForm, created_at: createdAt });
  }
  const respondentEmail = 'long.respondent.name.for.operations@example-international-company.com';
  service.records.push({ record_type: 'survey_response', record_id: 'responses-layout:Q01', created_at: createdAt,
    payload: { responseId: 'responses-layout', surveyId: form.id, companyId: 'synthetic-courier',
      company: 'Synthetic Courier International Logistics Corporation', surveyType: 'Courier',
      respondentEmail, respondentType: 'Rank & File', submissionDate: createdAt,
      questionId: 'Q01', questionNumber: 1, question: 'Reliability?', questionCategory: 'Delivery',
      rating: 4, comment: '', dataSource: 'client_csv' } });
  service.records.push({ record_type: 'survey_response', record_id: 'responses-other:Q01', created_at: createdAt,
    payload: { responseId: 'responses-other', surveyId: form.id, companyId: 'synthetic-courier',
      company: 'Synthetic Courier', surveyType: 'Courier', respondentEmail: 'other.respondent@example.com',
      respondentType: 'Rank & File', submissionDate: createdAt, questionId: 'Q01', questionNumber: 1,
      question: 'Reliability?', questionCategory: 'Delivery', rating: 3, comment: '', dataSource: 'client_csv' } });
  await page.goto('/login');
  await signIn(page);
  await openReadyPage(page, '/evaluation-workspace');
  await page.getByRole('button', { name: 'Responses', exact: true }).click();
  const explorer = page.getByRole('region', { name: 'Response explorer' });
  const selector = explorer.getByRole('group', { name: 'Available evaluation forms' });
  await expect(page.locator('.admin-response-explorer-page > section.panel')).toHaveCount(1);
  await expect(selector.getByRole('button')).toHaveCount(3);
  const selectorScrolls = await selector.evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(selectorScrolls).toBe((page.viewportSize()?.width ?? 0) < 760);
  const originalViewport = page.viewportSize()!;
  for (const width of [1440, 1024, 768, 393, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const strip of [page.getByRole('navigation', { name: 'Evaluation workspace views' }), selector]) {
      const dimensions = await strip.evaluate(element => ({
        height: element.clientHeight, scrollHeight: element.scrollHeight,
        scrollbar: getComputedStyle(element).scrollbarWidth,
      }));
      expect(dimensions.scrollHeight, `${width}px tab height`).toBe(dimensions.height);
      expect(dimensions.scrollbar).toBe('none');
    }
    for (const tab of await selector.getByRole('button').all()) {
      await tab.scrollIntoViewIfNeeded();
      await tab.click();
      await expect(tab).toHaveAttribute('aria-pressed', 'true');
      await expect(explorer.getByRole('heading', { name: (await tab.textContent())!.trim(), exact: true })).toBeVisible();
    }
    await page.getByRole('navigation', { name: 'Evaluation workspace views' }).screenshot({ path: testInfo.outputPath(`workspace-tabs-${width}.png`) });
    await selector.screenshot({ path: testInfo.outputPath(`survey-tabs-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  }
  await page.setViewportSize(originalViewport);
  await expect(selector.getByRole('button', { name: new RegExp(title) })).toBeVisible();
  await expect(selector.getByRole('button', { name: new RegExp(title) }).getByText('Courier', { exact: true })).toHaveCount(0);
  await selector.getByRole('button', { name: new RegExp(title) }).click();
  await expect(page.locator('#response-export-scope')).toHaveCount(0);
  const table = page.getByRole('table');
  await expect(table.getByRole('cell', { name: respondentEmail, exact: true })).toBeVisible();
  await expect(table.getByRole('button', { name: `View answers for ${respondentEmail}` })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  await selector.getByRole('button', { name: 'Supplier evaluation' }).click();
  await expect(explorer.getByRole('heading', { name: 'Supplier evaluation' })).toBeVisible();
  await expect(page.getByText('No responses have been submitted for this survey.')).toBeVisible();
  await selector.getByRole('button', { name: new RegExp(title) }).click();
  await expect(table.getByRole('cell', { name: respondentEmail, exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search respondent email' }).fill('long.respondent');
  await expect(table.getByRole('row')).toHaveCount(2);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export to Excel' }).click();
  const download = await downloadPromise;
  const workbook = XLSX.read(await readFile(await download.path()), { type: 'buffer' });
  const exportedRows = XLSX.utils.sheet_to_json<(string | number)[]>(workbook.Sheets.Responses, { header: 1 });
  expect(exportedRows).toHaveLength(2);
  expect(exportedRows[1][0]).toBe(respondentEmail);
  await page.getByRole('button', { name: 'Remove email search filter' }).click();
  await page.getByRole('searchbox', { name: 'Search respondent email' }).fill('no-match');
  await expect(page.getByText('No responses match the selected filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Remove email search filter' }).click();
  await expect(table.getByRole('cell', { name: respondentEmail, exact: true })).toBeVisible();
  await table.getByRole('button', { name: `View answers for ${respondentEmail}` }).click();
  await expect(page.getByRole('button', { name: 'Back to Responses' })).toBeVisible();
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
  await openReadyPage(page, '/analytics');
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

test('Feedback navigation has no vertical overflow and keeps tabs and delivery actions accessible', async ({ page }, testInfo) => {
  const service = await backend(page);
  service.records.push({ record_type: 'survey', record_id: evaluationForm.id, payload: evaluationForm, created_at: createdAt });
  service.profiles.push({ ...service.profiles[0], email: 'synthetic.employee@mgenesis.com', role: 'Employee' });
  await page.goto('/login');
  await signIn(page);
  await openReadyPage(page, '/feedback-hub');
  const navigation = page.getByRole('navigation', { name: 'Feedback Hub workflow' });

  for (const width of [1440, 1024, 768, 393, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ['Current Forms', 'Past Results', 'Sent Reports Log']) {
      const tab = navigation.getByRole('button', { name: new RegExp(name) });
      await tab.scrollIntoViewIfNeeded();
      await tab.focus();
      await tab.press('Enter');
      await expect(tab).toHaveAttribute('aria-pressed', 'true');
      const bounds = await tab.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      const overflow = await navigation.evaluate(element => ({
        height: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));
      expect(overflow.scrollHeight, `${width}px ${name}`).toBe(overflow.height);
    }
    const bulkSend = page.getByRole('button', { name: 'Bulk send', exact: true });
    await expect(bulkSend).toBeInViewport();
    await expect(bulkSend).toBeDisabled();
    await expect(page.getByText('Complete active surveys to enable', { exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await page.locator('.feedback-hub-navigation').screenshot({ path: testInfo.outputPath(`feedback-navigation-${width}.png`), animations: 'disabled' });
  }
});

test('Admin navigation and category selectors share compact underline states', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await backend(page);
  await page.goto('/login');
  await signIn(page);

  for (const [route, label] of [
    ['evaluation-workspace', 'Evaluation workspace views'],
    ['document-tracker', 'Filter document register by category'],
    ['feedback-hub', 'Feedback Hub workflow'],
    ['archive-center', 'Choose archived record type'],
    ['partners', 'Partner categories'],
    ['analytics', 'Analytics categories'],
    ['reports', 'Reports'],
  ] as const) {
    await openReadyPage(page, `/${route}`);
    const strip = page.getByRole('main').getByLabel(label, { exact: true });
    await expect(strip).toBeVisible();
    const overflow = await strip.evaluate(element => ({ height: element.clientHeight, scrollHeight: element.scrollHeight, scrollbar: getComputedStyle(element).scrollbarWidth }));
    expect(overflow.scrollHeight, label).toBe(overflow.height);
    expect(overflow.scrollbar, label).toBe('none');
    const buttons = strip.locator(':scope > button');
    expect(await buttons.count()).toBeGreaterThan(1);
    const selected = strip.locator(':scope > button[aria-pressed="true"], :scope > button[aria-selected="true"], :scope > button[aria-current="page"]').first();
    await expect(selected).toBeVisible();
    const styles = await selected.evaluate(button => ({
      background: getComputedStyle(button).backgroundColor,
      border: getComputedStyle(button).borderBottomColor,
      fontSize: getComputedStyle(button).fontSize,
    }));
    expect(styles.background).toBe('rgba(0, 0, 0, 0)');
    expect(styles.border).toBe('rgb(0, 99, 169)');
    expect(styles.fontSize).toBe(test.info().project.use.isMobile ? '12px' : '13px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await strip.screenshot({ path: testInfo.outputPath(`tabs-${route}.png`), animations: 'disabled' });
  }
});

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
    await openReadyPage(page, `/${route}`);
    const header = page.locator('.admin-page-heading');
    await expect(header.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
    if (hasSubtitle) await expect(header.locator('p')).toHaveCount(1);
    if (route === 'employees-users') {
      await expect(page.locator('.admin-accounts-page')).toBeVisible();
      const currentAccount = page.getByRole('row', { name: /synthetic\.admin@mgenesis\.com/i });
      await expect(currentAccount.getByRole('button', { name: 'Delete Account', exact: true })).toBeDisabled();
    }
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
      const action = header.getByRole('button', { name: 'Document Maintenance', exact: true });
      await action.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Document maintenance', exact: true })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Document maintenance settings' }).getByRole('button'))
        .toHaveText(['Reminder schedule', 'Validity periods', 'Category alerts']);
      await expect(page.getByRole('heading', { name: 'Global reminder schedule', exact: true })).toBeVisible();
      await page.getByRole('dialog', { name: 'Document maintenance', exact: true }).screenshot({ path: testInfo.outputPath('document-maintenance.png'), animations: 'disabled' });
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

test('Dashboard separates official submissions, scores and evaluation progress at desktop and mobile sizes', async ({ page }, testInfo) => {
  const service = await backend(page);
  service.profiles.push({ ...service.profiles[0], email: 'synthetic.employee@mgenesis.com', role: 'Employee' });
  service.profiles.push({ ...service.profiles[0], email: 'synthetic.executive@mgenesis.com', role: 'Employee', designation: 'Executive' });
  service.records.push({ record_type: 'partner_company', record_id: 'unclassified-partner', created_at: createdAt, payload: {
    id: 'unclassified-partner', name: 'Synthetic Unclassified Partner', type: 'Uncategorized', createdAt, branches: [],
  } });
  service.records.push({ record_type: 'survey', record_id: 'dashboard-round', created_at: createdAt, payload: {
    id: 'dashboard-round', title: 'Courier round', surveyType: 'Courier', description: '', createdAt,
    status: 'Running', questions: [{ questionId: 'Q01', questionNumber: 1, question: 'Delivery', questionCategory: 'Delivery' }],
  } });
  for (const [id, dataSource] of [['official-one', 'production_submission'], ['official-repeat', 'production_submission'], ['test-only', 'test_submission']] as const) {
    service.records.push({ record_type: 'survey_response', record_id: `${id}:Q01`, created_at: createdAt, payload: {
      responseId: id, ...(id === 'official-one' ? {} : { surveyId: 'dashboard-round' }), surveyType: 'Courier',
      companyId: id === 'official-repeat' ? 'unclassified-partner' : 'synthetic-courier',
      company: id === 'official-repeat' ? 'Synthetic Unclassified Partner' : 'Synthetic Courier',
      respondentType: 'Employee', respondentEmail: 'synthetic.employee@mgenesis.com', submissionDate: '2026-10-28T00:00:00Z',
      questionId: 'Q01', questionNumber: 1, question: 'Delivery', questionCategory: 'Delivery', rating: 0, comment: '', dataSource,
    } });
  }
  await page.goto('/login');
  await signIn(page);
  const forms = page.getByRole('table', { name: 'Evaluation forms in progress' });
  const results = page.getByRole('table', { name: 'Average partner evaluation score by type' });
  await expect(forms.getByRole('cell', { name: 'Active', exact: true })).toBeVisible();
  await expect(forms.getByText('1 of 1 completed · 100%', { exact: true })).toBeVisible();
  await expect(results.getByText('1 of 1 completed · 100%', { exact: true })).toBeVisible();
  await expect(results.getByText('2 submissions', { exact: true })).toBeVisible();
  await expect(results.getByText('Based on 2 scored submissions', { exact: true })).toBeVisible();
  await expect(results.getByText('1 need partner classification', { exact: true })).toBeVisible();
  const recent = page.getByRole('table', { name: 'Recent evaluation submissions' });
  await expect(recent.locator('tbody tr')).toHaveCount(2);
  await expect(recent.getByText('0.00 / 100', { exact: true })).toHaveCount(2);
  await expect(recent.getByText('synthetic.employee@mgenesis.com', { exact: true })).toHaveCount(2);
  await expect(recent.getByRole('cell', { name: 'Courier round synthetic.employee@mgenesis.com', exact: true })).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('dashboard-expected-totals.png'), animations: 'disabled', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.getByRole('button', { name: 'All-Time', exact: true }).click();
  await expect(results.getByRole('columnheader', { name: 'Current-round completion', exact: true })).toBeVisible();
  await expect(results.getByText('1 of 1 completed · 100%', { exact: true })).toBeVisible();
  await expect(results.getByText('Completion unavailable', { exact: true })).toHaveCount(0);
  for (const label of await results.locator('.admin-dashboard-count').all()) {
    const bounds = await label.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return { text: range.getBoundingClientRect().toJSON(), cell: element.closest('td')!.getBoundingClientRect().toJSON() };
    });
    expect(bounds.text.left).toBeGreaterThanOrEqual(bounds.cell.left);
    expect(bounds.text.right).toBeLessThanOrEqual(bounds.cell.right + 1);
  }
  const resultRegion = page.getByRole('region', { name: 'Evaluation results table', exact: true });
  await resultRegion.focus();
  await expect(resultRegion).toBeFocused();
  if (testInfo.project.use.isMobile) {
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => resultRegion.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await resultRegion.evaluate(element => { element.scrollLeft = 0; });
  }
  await page.screenshot({ path: testInfo.outputPath('dashboard-historical-totals.png'), animations: 'disabled', fullPage: true });
  await expect(forms.getByText('1 of 1 completed · 100%', { exact: true })).toBeVisible();
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
});

test('Evaluation Progress opens assigned employees and dismisses safely without changing evaluations', async ({ page }, testInfo) => {
  const service = await backend(page);
  const employeeEmail = 'assigned.employee@mgenesis.com';
  const pendingEmail = 'pending.employee@mgenesis.com';
  for (const email of [employeeEmail, pendingEmail]) service.profiles.push({ ...service.profiles[0], email, role: 'Employee' });
  service.profiles.push({ ...service.profiles[0], email: 'excluded.executive@mgenesis.com', role: 'Employee', designation: 'Executive' });
  service.records.push({ record_type: 'partner_company', record_id: 'pending-courier', created_at: createdAt,
    payload: { id: 'pending-courier', name: 'Pending Courier', type: 'Courier', createdAt, branches: [] } });
  service.records.push({ record_type: 'survey', record_id: 'assignment-form', created_at: createdAt,
    payload: { id: 'assignment-form', title: 'Assignment details survey', surveyType: 'Courier', description: '', createdAt,
      status: 'Running', questions: [{ questionId: 'Q01', questionNumber: 1, question: 'Delivery', questionCategory: 'Delivery' }] } });
  service.records.push({ record_type: 'survey_response', record_id: 'assigned-response:Q01', created_at: createdAt, payload: {
    responseId: 'assigned-response', surveyId: 'assignment-form', companyId: 'synthetic-courier', company: 'Synthetic Courier',
    surveyType: 'Courier', respondentType: 'Employee', respondentEmail: employeeEmail, submissionDate: '2026-10-28T00:00:00Z',
    questionId: 'Q01', questionNumber: 1, question: 'Delivery', questionCategory: 'Delivery', rating: 0, comment: '', dataSource: 'production_submission',
  } });
  await page.goto('/login');
  await signIn(page);
  const trigger = page.getByRole('button', { name: 'View evaluation progress for Assignment details survey', exact: true });
  await expect(trigger).toContainText('1 of 4 completed');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Evaluation Progress', exact: true });
  const close = dialog.getByRole('button', { name: 'Close evaluation progress' });
  await expect(dialog).toBeVisible();
  await expect(close).toBeFocused();
  await expect(dialog.getByText('1 of 4 assignments completed · 25%', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('row').filter({ hasText: employeeEmail })).toContainText('1 / 2');
  await expect(dialog.getByRole('row').filter({ hasText: pendingEmail })).toContainText('0 / 2');
  await expect(dialog.getByText('excluded.executive@mgenesis.com', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.locator('summary').last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await dialog.getByRole('row').filter({ hasText: employeeEmail }).locator('summary').click();
  const employeeRow = dialog.getByRole('row').filter({ hasText: employeeEmail });
  await expect(employeeRow.getByText('Synthetic Courier', { exact: true })).toBeVisible();
  await expect(employeeRow.getByRole('listitem').filter({ hasText: 'Synthetic Courier' })).toContainText('Completed');
  await expect(employeeRow.getByRole('listitem').filter({ hasText: 'Pending Courier' })).toContainText('Pending');
  await dialog.getByRole('heading', { name: 'Evaluation Progress', exact: true }).click();
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.height).toBeLessThanOrEqual(viewport.height);
  expect(await dialog.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('assignment-completion.png'), animations: 'disabled' });
  await page.evaluate(() => document.body.classList.add('dark'));
  await page.screenshot({ path: testInfo.outputPath('assignment-completion-dark.png'), animations: 'disabled' });
  await page.evaluate(() => document.body.classList.remove('dark'));
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.locator('.dashboard-assignment-backdrop').dispatchEvent('pointerdown');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await close.click();
  await expect(dialog).toHaveCount(0);
  const submission = service.records.find(record => record.record_type === 'survey_response')!;
  submission.payload.dataSource = 'test_submission';
  await page.reload();
  await expect(trigger).toContainText('0 of 4 completed');
  await trigger.click();
  await expect(dialog.getByText('0 of 4 assignments completed · 0%', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('row').filter({ hasText: employeeEmail })).toContainText('0 / 2');
  await close.click();
  expect(service.records.filter(record => record.record_type === 'survey_response')).toHaveLength(1);
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

test('Notification ages advance, document details stay visible, and complete history survives reload', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.clock.install({ time: new Date('2026-11-03T23:59:30Z') });
  const service = await backend(page);
  service.records[0].payload.branches = [{ id: 'branch', bpCode: 'SYN', documents: { 'Business Permit': { provided: true, expiryDate: '2026-11-03' } } }];
  for (let i = 0; i < 22; i++) service.records.push({ record_type: 'survey_response', record_id: `notification-${i}:Q01`, created_at: createdAt,
    payload: { responseId: `notification-${i}`, company: `Notification partner ${i}`, companyId: 'synthetic-courier', surveyType: 'Courier', respondentType: 'Employee', respondentEmail: email,
      submissionDate: new Date(Date.parse('2026-11-04T00:00:00Z') - i * 60_000).toISOString(), questionId: 'Q01', questionNumber: 1, question: 'Reliability?', questionCategory: 'Delivery', rating: 0, comment: '' } });
  service.records.push({ record_type: 'survey_response', record_id: 'blank:Q01', created_at: createdAt,
    payload: { ...service.records[2].payload, responseId: 'blank', company: 'Blank notification', rating: 'N/A' } });
  service.records.push({ record_type: 'document_reminder_delivery', record_id: 'synthetic-reminder', created_at: createdAt,
    payload: { id: 'synthetic-reminder', companyId: 'synthetic-courier', company: 'Delivered reminder partner', surveyType: 'Courier', branchId: 'branch', branchCode: 'SYN', documentName: 'Synthetic permit', expiryDate: '2026-12-31', daysLeft: 60, milestone: 'day-60', deliveredAt: '2026-11-01T00:05:00.179105+00:00' } });
  await page.goto('/login');
  await signIn(page);
  const bell = page.getByRole('button', { name: /^Recent activity/ });
  await expect(bell).toHaveAttribute('aria-label', 'Recent activity, 24 unread');
  await page.clock.pauseAt(new Date('2026-11-04T00:01:30Z'));
  await bell.click();
  const dropdown = page.getByRole('region', { name: 'Recent activity', exact: true });
  const recent = dropdown.getByRole('listitem').filter({ hasText: 'Notification partner 0' });
  await expect(recent).toContainText('1m ago');
  await page.clock.fastForward(61_000);
  await expect(recent).toContainText('2m ago');
  await bell.click();
  await page.clock.fastForward(61_000);
  await bell.click();
  await expect(recent).toContainText('3m ago');
  await dropdown.getByRole('button', { name: 'View all notifications' }).click();
  const dialog = page.getByRole('dialog', { name: 'All Notifications', exact: true });
  await expect(dialog.getByRole('button', { name: 'All (24)', exact: true })).toBeVisible();
  await expect(dialog.getByRole('listitem').filter({ hasText: 'Notification partner 0' })).toContainText('3m ago');
  await page.clock.fastForward(61_000);
  await expect(dialog.getByRole('listitem').filter({ hasText: 'Notification partner 0' })).toContainText('4m ago');
  await page.clock.setSystemTime(new Date('2026-11-04T00:10:30Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(dialog.getByRole('listitem').filter({ hasText: 'Notification partner 0' })).toContainText('10m ago');
  await dialog.getByRole('combobox', { name: 'Activity', exact: true }).selectOption('document');
  await expect(dialog.getByRole('listitem')).toHaveCount(2);
  await expect(dialog).toContainText('Synthetic permit');
  await expect(dialog).toContainText('60 days at delivery');
  await expect(dialog).toContainText('Current status');
  await expect(dialog).not.toContainText('question answered');
  await dialog.getByRole('listitem').filter({ hasText: 'Delivered reminder partner' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('notification-document-details.png'), animations: 'disabled' });
  await page.reload();
  // Let deferred hydration paint while keeping the age assertions on a controlled clock.
  await expect.poll(async () => { await page.clock.runFor(100); return bell.getAttribute('aria-label'); }).toBe('Recent activity, 24 unread');
  await bell.click();
  await dropdown.getByRole('button', { name: 'View all notifications' }).click();
  await expect(dialog.getByRole('button', { name: 'All (24)', exact: true })).toBeVisible();
  await expect(dialog).toContainText('Notification partner 21');
  await expect(dialog).not.toContainText('Blank notification');
  await expect(dialog).toContainText('Current status');
  expect(service.records.filter(record => record.record_type === 'survey_response')).toHaveLength(23);
  await openReadyPage(page, '/notifications');
  const logRow = page.getByRole('row').filter({ hasText: 'Notification partner 0' });
  await expect.poll(async () => { await page.clock.runFor(100); return logRow.count(); }).toBe(1);
  await expect(logRow).toContainText('10m ago');
  await page.clock.fastForward(61_000);
  await expect(logRow).toContainText('11m ago');
  expect(service.errors).toEqual([]);
});

test('Realtime delivers submissions and read/unread changes between two sessions and reconciles reconnects', async ({ page, browser }, testInfo) => {
  test.setTimeout(90_000);
  const sockets: Array<{ ws: WebSocketRoute; topic: string; joinRef: string; id: number; closed: boolean }> = [];
  const connect = async (clientPage: Page) => clientPage.routeWebSocket('**/realtime/v1/**', ws => {
    const connections: typeof sockets = [];
    ws.onClose(() => connections.forEach(connection => { connection.closed = true; }));
    ws.onMessage(message => {
      const [joinRef, ref, topic, event, payload] = JSON.parse(String(message));
      if (event === 'phx_join') {
        const filters = (payload.config?.postgres_changes ?? []).map((filter: Record<string, unknown>, i: number) => ({ ...filter, id: i + 1 }));
        const id = filters.find((filter: Record<string, unknown>) => filter.table === 'application_records')?.id;
        if (id) { const connection = { ws, topic, joinRef, id, closed: false }; sockets.push(connection); connections.push(connection); }
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: filters } }]));
      } else if (event === 'heartbeat' || event === 'phx_leave') {
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
      }
    });
  });
  const publish = (record: SyntheticRecord, type = 'UPDATE') => sockets.filter(socket => !socket.closed).forEach(socket => socket.ws.send(JSON.stringify([
    socket.joinRef, null, socket.topic, 'postgres_changes', { ids: [socket.id], data: { schema: 'public', table: 'application_records', type, commit_timestamp: new Date().toISOString(), columns: [], record: type === 'DELETE' ? {} : record, old_record: type === 'DELETE' ? { record_type: record.record_type, record_id: record.record_id } : {}, errors: null } },
  ])));
  await connect(page);
  const service = await backend(page, 'Admin', false, { onWrite: publish });
  const otherContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: page.viewportSize()!, isMobile: Boolean(testInfo.project.use.isMobile) });
  try {
    const other = await otherContext.newPage();
    await connect(other);
    await backend(other, 'Admin', false, { records: service.records, onWrite: publish });
    for (const clientPage of [page, other]) { await clientPage.goto('/login'); await signIn(clientPage); }
    await expect.poll(() => sockets.filter(socket => !socket.closed).length).toBe(2);
    const response: SyntheticRecord = { record_type: 'survey_response', record_id: 'realtime-notification:Q01', created_at: createdAt,
      payload: { responseId: 'realtime-notification', company: 'Realtime partner', surveyType: 'Courier', respondentType: 'Employee', respondentEmail: email, submissionDate: new Date().toISOString(), questionId: 'Q01', questionNumber: 1, question: 'Reliability?', questionCategory: 'Delivery', rating: 0, comment: '' } };
    service.records.push(response);
    publish(response);
    for (const clientPage of [page, other]) {
      await expect(clientPage.getByRole('button', { name: 'Recent activity, 1 unread', exact: true })).toBeVisible();
      await clientPage.getByRole('button', { name: /^Recent activity/ }).click();
      await clientPage.getByRole('button', { name: 'View all notifications' }).click();
      await expect(clientPage.getByRole('dialog')).toContainText('Realtime partner');
    }
    await page.getByRole('button', { name: 'Mark as read: Realtime partner', exact: true }).click();
    await expect(other.getByRole('button', { name: 'Mark as unread: Realtime partner', exact: true })).toBeVisible();
    await other.getByRole('button', { name: 'Mark as unread: Realtime partner', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mark as read: Realtime partner', exact: true })).toBeVisible();
    const previousConnections = sockets.length;
    sockets.filter(socket => !socket.closed).forEach(socket => { socket.closed = true; socket.ws.close({ code: 1012, reason: 'Synthetic reconnect' }); });
    response.payload = { ...response.payload, company: 'Updated during disconnect' };
    await expect.poll(() => sockets.length).toBeGreaterThan(previousConnections);
    await expect(page.getByRole('dialog')).toContainText('Updated during disconnect');
    await expect(other.getByRole('dialog')).toContainText('Updated during disconnect');
    // The Directory breakdown follows the same shared registry, including an empty one.
    let legacyRegistryReads = 0;
    for (const clientPage of [page, other]) {
      clientPage.on('request', request => { if (new URL(request.url()).pathname === '/rest/v1/companies') legacyRegistryReads++; });
      await openReadyPage(clientPage, '/partner-companies');
    }
    const partner: SyntheticRecord = { record_type: 'partner_company', record_id: 'realtime-partner', created_at: createdAt,
      payload: { id: 'realtime-partner', name: 'Realtime Supplier', type: 'Supplier', supplierOrigin: 'Local', createdAt,
        branches: [{ id: 'trade', bpCode: 'LIVE', rawCategory: 'Supplier-Local', supplierRank: 'Major' },
          { id: 'nt', bpCode: 'LIVE-NT', rawCategory: 'Supplier-Local-NT', supplierRank: 'Regular' }] } };
    const breakdown = (clientPage: Page) => clientPage.locator('#partner-category-breakdown-content');
    service.records.push(partner); publish(partner, 'INSERT');
    for (const clientPage of [page, other]) {
      await expect(breakdown(clientPage)).toContainText('2 Accredited Branches Mapped');
      await expect(breakdown(clientPage)).toContainText('67% Rank Mapping Coverage');
      await expect(breakdown(clientPage).getByText('50.0% share', { exact: true })).toHaveCount(2);
    }
    partner.payload.branches = [{ id: 'trade', bpCode: 'LIVE', rawCategory: 'Supplier-Foreign', supplierRank: 'Regular' }];
    partner.payload.supplierOrigin = 'Foreign'; publish(partner);
    for (const clientPage of [page, other]) await expect(breakdown(clientPage)).toContainText('1 Accredited Branches Mapped');
    // Recover a missed partner edit through subscription reconciliation.
    const partnerConnections = sockets.length;
    sockets.filter(socket => !socket.closed).forEach(socket => { socket.closed = true; socket.ws.close({ code: 1012, reason: 'Synthetic partner reconnect' }); });
    partner.payload.branches = [{ id: 'trade', bpCode: 'LIVE', rawCategory: 'Supplier-Foreign', supplierRank: 'Major' }];
    await expect.poll(() => sockets.length).toBeGreaterThan(partnerConnections);
    for (const clientPage of [page, other]) {
      await expect(breakdown(clientPage).getByText('100.0% share', { exact: true })).toHaveCount(1);
      await expect(breakdown(clientPage).getByText('Major Rank', { exact: true }).locator('../..')).toContainText('1 branches');
    }
    const removedPartners = service.records.filter(record => record.record_type === 'partner_company');
    for (const record of removedPartners) { service.records.splice(service.records.indexOf(record), 1); publish(record, 'DELETE'); }
    for (const clientPage of [page, other]) {
      await expect(breakdown(clientPage)).toContainText('0 Accredited Branches Mapped');
      await expect(breakdown(clientPage)).toContainText('0 of 0 partner branches');
      await clientPage.reload();
      await expect(breakdown(clientPage)).toContainText('0 of 0 partner branches');
    }
    expect(legacyRegistryReads).toBe(0);
    expect(service.errors).toEqual([]);
  } finally { await otherContext.close(); }
});

test('login links preserve their headings and Employee sign-in follows its verified role', async ({ page }, testInfo) => {
  await backend(page, 'Employee');
  for (const [path, heading] of [['/admin/login', 'Vendor Management System'], ['/employee/login', 'Vendor Performance Evaluation']]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(path + '$'));
    await expect(page.getByText(heading, { exact: true }).filter({ visible: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /Admin Account|Employee Account/ })).toHaveCount(0);
    await page.reload();
    await expect(page).toHaveURL(new RegExp(path + '$'));
    await expect(page.getByText(heading, { exact: true }).filter({ visible: true })).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath(`${heading === 'Vendor Management System' ? 'admin' : 'employee'}-login.png`), animations: 'disabled' });
  }
  await page.goto('/admin/login'); await signIn(page, 'Employee');
  await expect(page.getByRole('alert')).toContainText('/employee/login');
  await expect(page.getByRole('main')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await page.goto('/employee/login'); await signIn(page, 'Employee');
  await expect(page).toHaveURL(/dashboard$/);
  await expect(page).toHaveTitle('Vendor Performance Evaluation');
  await page.reload(); await expect(page).toHaveTitle('Vendor Performance Evaluation');
  await page.goto('/admin/login');
  await expect(page.getByRole('alert')).toContainText('/employee/login');
  await expect(page.getByRole('main')).toHaveCount(0);
  await page.goto('/employee/login'); await signIn(page, 'Employee');
  await openReadyPage(page, '/employees-users');
  await expect(page.getByRole('navigation', { name: 'Administrator workspace', exact: true })).toHaveCount(0);
  await expect(page).not.toHaveURL(/employees-users$/);
  await openReadyPage(page, '/employees-users');
  await expect(page.getByRole('navigation', { name: 'Administrator workspace', exact: true })).toHaveCount(0);
  await expect(page).not.toHaveURL(/employees-users$/);
  await page.locator('#account-menu-trigger').click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/login$/);
});

test('Analytics ranking method remains single-line beside date tabs and repositions on mobile', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await backend(page);
  await page.goto('/login');
  await signIn(page);
  await openReadyPage(page, '/analytics');
  const method = page.getByRole('group', { name: 'Company ranking method', exact: true });
  const scopes = page.getByRole('group', { name: 'Analytics date scope', exact: true });
  for (const width of [1440, 1024, 768, 393, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ['Current', 'All time', 'Custom']) {
      const tab = scopes.getByRole('button', { name, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-pressed', 'true');
      await expect(method).toBeVisible();
    }
    const geometry = await method.evaluate(element => {
      const style = getComputedStyle(element);
      const segments = Array.from(element.children).map(child => ({
        top: child.getBoundingClientRect().top, height: child.getBoundingClientRect().height,
        whiteSpace: getComputedStyle(child).whiteSpace,
        underline: getComputedStyle(child).borderBottomStyle,
        underlineWidth: getComputedStyle(child).borderBottomWidth,
        underlineColor: getComputedStyle(child).borderBottomColor,
      }));
      return { segments, width: element.clientWidth, scrollWidth: element.scrollWidth,
        background: style.backgroundColor, border: style.borderWidth, padding: style.padding, shadow: style.boxShadow };
    });
    expect(geometry.background).toBe('rgba(0, 0, 0, 0)');
    expect(geometry.border).toBe('0px');
    expect(geometry.padding).toBe('0px');
    expect(geometry.shadow).toBe('none');
    expect(geometry.segments[1].underline).toBe('solid');
    expect(geometry.segments[1].underlineWidth).toBe(await scopes.getByRole('button', { name: 'Custom', exact: true }).evaluate(element => getComputedStyle(element).borderBottomWidth));
    expect(geometry.segments[1].underlineColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(geometry.scrollWidth).toBe(geometry.width);
    expect(geometry.segments[0].top).toBe(geometry.segments[1].top);
    expect(geometry.segments[0].height).toBe(geometry.segments[1].height);
    expect(geometry.segments.every(segment => segment.whiteSpace === 'nowrap')).toBe(true);
    const methodBounds = (await method.boundingBox())!;
    const scopeBounds = (await scopes.boundingBox())!;
    if (width >= 1024) expect(methodBounds.y + methodBounds.height / 2).toBeCloseTo(scopeBounds.y + scopeBounds.height / 2, 0);
    else expect(methodBounds.y).toBeGreaterThanOrEqual(scopeBounds.y + scopeBounds.height);
    expect(methodBounds.x + methodBounds.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await method.locator('..').screenshot({ path: testInfo.outputPath(`analytics-ranking-method-${width}.png`), animations: 'disabled' });
  }
  await page.locator('html').evaluate(element => element.classList.add('dark'));
  await method.locator('..').screenshot({ path: testInfo.outputPath('analytics-ranking-method-dark.png'), animations: 'disabled' });
});

test('a forged browser account cannot open a protected deep link', async ({ page }) => {
  const service = await backend(page);
  await page.addInitScript(() => localStorage.setItem('user_account', 'synthetic.admin@mgenesis.com'));
  await page.goto('/partners');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
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


test('Admin directory filtering, archive dismissal and archive persistence work in the built UI', async ({ page }, testInfo) => {
  const service = await backend(page);
  await page.goto('/login');
  await signIn(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await openReadyPage(page, '/partners');
  const directory = page.getByRole('button', { name: 'Open Synthetic Courier partner record', exact: true }).filter({ visible: true });
  const search = page.getByRole('textbox', { name: 'Search partners by name or BP Code' });
  await expect(directory).toBeVisible({ timeout: 15_000 });
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
  await openReadyPage(page, '/reports');
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
  await page.getByRole('combobox', { name: 'Paper size', exact: true }).selectOption('legal');
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
      expect(pdf).toMatch(/\/MediaBox \[0 0 612(?:\.0*)? 1008(?:\.0*)?\]/);
      for (const text of ['Archived Survey Report', 'First archived survey', 'current rubric', 'Report scope', 'Supplier Management System']) {
        expect(pdf).toContain(text);
      }
      const pageCount = Number(pdf.match(/\/Count (\d+)/)?.[1]);
      expect(pageCount).toBeGreaterThan(0);
      expect((pdf.match(/\/I\d+ Do/g) ?? []).length).toBe(pageCount);
      expect(pdf).not.toContain('SMPESA');
      expect(pdf).toContain(`/Author (Microgenesis)`);
      expect(pdf).not.toContain('This report provides a comprehensive summary of survey analytics');
    }
    else if (format === 'docx') {
      const archive = XLSX.CFB.read(bytes, { type: 'buffer' });
      const xml = XLSX.CFB.find(archive, '/word/document.xml')!;
      expect(Buffer.from(xml.content as Uint8Array).toString()).toContain('First archived survey');
      expect(Buffer.from(xml.content as Uint8Array).toString()).toMatch(/w:pgSz[^>]*w:w="12240"[^>]*w:h="20160"/);
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
  await expect(page.getByRole('combobox', { name: 'Paper size', exact: true })).toHaveValue('legal');
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
  await openReadyPage(page, '/reports?tab=history');
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
  await waitForReadyPage(page);
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

test('detailed and raw PDF downloads share system branding, company metadata and complete page numbering', async ({ page }) => {
  test.setTimeout(120_000);
  const service = await backend(page);
  service.records.push({ record_type: 'survey_response', record_id: 'pdf-evaluation:Q01', created_at: createdAt,
    payload: { responseId: 'pdf-evaluation', companyId: 'synthetic-courier', company: 'Synthetic Courier', surveyType: 'Courier',
      respondentType: 'Employee', submissionDate: new Date().toISOString(), questionId: 'Q01', questionNumber: 1,
      question: 'Reliability?', questionCategory: 'Reliability/Delivery', rating: 12, comment: '', dataSource: 'client_csv' } });
  await page.goto('/login');
  await signIn(page);
  for (const [report, trigger, pdfButton] of [
    ['Summary Report', 'Export Report', 'Export PDF Document'],
    ['Executive', 'Export Executive Dossier', 'Export PDF Document'],
    ['Question Report', 'Export', 'PDF Document'],
    ['Companies Report', 'Export', 'PDF'],
    ['Raw Data Export', 'Export As', 'PDF'],
  ]) {
    await page.goto('/reports');
    if (report === 'Executive') await page.getByRole('button', { name: 'Build Executive Report', exact: true }).click();
    else await page.getByRole('article').filter({ has: page.getByRole('heading', { name: report, exact: true }) }).getByRole('button', { name: 'Build report', exact: true }).click();
    const exportButton = report === 'Raw Data Export'
      ? page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Courier', exact: true }) }).getByRole('button', { name: trigger, exact: true })
      : page.getByRole('button', { name: trigger, exact: true });
    await exportButton.click();
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: pdfButton, exact: true }).click();
    const download = await event;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    const pdf = (await readFile((await download.path())!)).toString('latin1');
    const pages = Number(pdf.match(/\/Count (\d+)/)?.[1]);
    expect(pages, report).toBeGreaterThan(0);
    expect((pdf.match(/\/I\d+ Do/g) ?? []).length, report).toBeGreaterThanOrEqual(pages);
    expect(pdf, report).not.toContain('SMPESA');
    expect(pdf, report).toContain('/Author (Microgenesis)');
    for (let pageNumber = 1; pageNumber <= pages; pageNumber++) expect(pdf, report).toContain(`Page ${pageNumber} of ${pages}`);
    if (report === 'Executive') expect(pdf).toContain('Strictly Confidential');
  }
  expect(service.errors).toEqual([]);
  expect(service.unexpected).toEqual([]);
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

test('Dashboard retains loaded results when assignment lists fail and recovers completion after retry', async ({ page }, testInfo) => {
  const service = await backend(page);
  service.failures.activeListReads = true;
  service.profiles.push({ ...service.profiles[0], email: 'synthetic.employee@mgenesis.com', role: 'Employee' });
  service.records.push({ record_type: 'survey', record_id: evaluationForm.id, created_at: createdAt, payload: { ...evaluationForm } });
  service.records.push({ record_type: 'survey_response', record_id: 'dashboard-retained:Q01', created_at: createdAt,
    payload: { responseId: 'dashboard-retained', surveyId: evaluationForm.id, companyId: 'synthetic-courier', company: 'Synthetic Courier',
      surveyType: 'Courier', respondentEmail: email, respondentType: 'Rank & File', department: 'TASS', submissionDate: new Date().toISOString(),
      questionId: 'Q01', questionNumber: 1, question: 'Delivery', questionCategory: 'Delivery', rating: 15, comment: '', dataSource: 'client_csv' } });
  await page.goto('/login');
  await signIn(page);
  await expect(page.getByRole('alert').filter({ hasText: 'Evaluation assignments are unavailable:' })).toBeVisible();
  await expect(page.getByText(/Dashboard data could not be loaded:/)).toHaveCount(0);
  const forms = page.getByRole('table', { name: 'Evaluation forms in progress' });
  const results = page.getByRole('table', { name: 'Average partner evaluation score by type' });
  const recent = page.getByRole('table', { name: 'Recent evaluation submissions' });
  await expect(forms.getByText('Completion unavailable', { exact: true })).toBeVisible();
  await expect(results.getByText('1 submissions', { exact: true })).toBeVisible();
  await expect(results.getByText('Based on 1 scored submissions', { exact: true })).toBeVisible();
  await expect(recent.getByText('Synthetic Courier', { exact: true })).toBeVisible();
  await expect(page.getByText('No required assignments', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('dashboard-assignment-setup-error.png'), fullPage: true, animations: 'disabled' });
  service.failures.activeListReads = false;
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('supabase-application-record-changed', { detail: { recordType: 'survey' } })));
  await expect(page.getByRole('alert').filter({ hasText: 'Evaluation assignments are unavailable:' })).toHaveCount(0);
  await expect(forms.getByText('0 of 1 completed · 0%', { exact: true })).toBeVisible();
  await expect(recent.getByText('Synthetic Courier', { exact: true })).toBeVisible();
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
});

test('employee assignments follow the uploaded supplier list instead of all 273 registered suppliers', async ({ page }, testInfo) => {
  const service = await backend(page, 'Employee');
  const names = Array.from({ length: 273 }, (_, i) => `Registered Supplier ${i}`);
  service.records.push(...names.map((name, i) => ({ record_type: 'partner_company', record_id: `supplier-${i}`, created_at: createdAt,
    payload: { id: `supplier-${i}`, name, type: 'Supplier', createdAt, isArchived: false } })));
  const form = { ...evaluationForm, id: 'supplier-active', title: 'Supplier Active List Survey', surveyType: 'Supplier' };
  service.records.push({ record_type: 'survey', record_id: form.id, created_at: createdAt, payload: form });
  const retainedResponse = { record_type: 'survey_response', record_id: 'retained:Q01', created_at: createdAt,
    payload: { responseId: 'retained', surveyId: form.id, companyId: 'supplier-272', company: names[272], surveyType: 'Supplier',
      respondentEmail: email, respondentType: 'Rank & File', department: 'TASS', submissionDate: createdAt, questionId: 'Q01',
      questionNumber: 1, question: 'Retained answer', questionCategory: 'Quality', rating: 5, comment: '' } };
  service.records.push(retainedResponse);
  service.activeLists.value = [{ survey_type: 'Supplier', companies: names.slice(0, 20) }];
  await page.goto('/login');
  await signIn(page, 'Employee');
  await page.getByRole('button', { name: 'Supplier: 20 pending', exact: true }).click();
  await expect(page.getByLabel('20 pending supplier evaluations', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('employee-active-suppliers.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'View all 20 pending supplier evaluations', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search partner or evaluation title' }).fill(names[272]);
  await expect(page.getByRole('heading', { name: 'No matching evaluations', exact: true })).toBeVisible();
  service.activeLists.value = [{ survey_type: 'Supplier', companies: names.slice(20, 22) }];
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('supabase-application-record-changed', { detail: { recordType: 'survey' } })));
  await expect(page.getByRole('button', { name: 'Supplier: 2 pending', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search partner or evaluation title' }).fill('');
  await expect(page.getByRole('heading').getByRole('button', { name: 'Start supplier evaluation for Registered Supplier 20', exact: true })).toBeVisible();
  service.activeLists.value = [];
  await page.reload();
  await expect(page.getByRole('button', { name: 'Supplier: 0 pending', exact: true })).toBeVisible();
  service.failures.activeListReads = true;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Evaluations are unavailable', exact: true })).toBeVisible();
  await expect(page.getByLabel('Pending evaluation count unavailable', { exact: true })).toBeVisible();
  expect(service.records.filter(record => record.record_type === 'survey_response')).toEqual([retainedResponse]);
  expect(service.records.filter(record => record.record_type === 'partner_company' && record.payload.type === 'Supplier')).toHaveLength(273);
  expect(service.unexpected).toEqual([]);
  expect(service.errors).toEqual([]);
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

test('Admin is rejected by the employee entrance and accepted by the admin entrance', async ({ page }) => {
 await backend(page); await page.goto('/employee/login'); await signIn(page);
 await expect(page.getByRole('alert')).toContainText('/admin/login');
 await expect(page.getByRole('main')).toHaveCount(0);
 await page.goto('/admin/login'); await signIn(page);
 await expect(page).toHaveURL(/dashboard$/);
 await expect(page).toHaveTitle('Vendor Management System');
 await page.reload(); await expect(page).toHaveTitle('Vendor Management System');
 await page.goto('/employee/login');
 await expect(page.getByRole('alert')).toContainText('/admin/login');
 await expect(page.getByRole('main')).toHaveCount(0);
});
test('unified login rejects a missing authorization profile', async ({ page }) => {
 const service=await backend(page); service.profiles.splice(0);
 await page.goto('/admin/login'); await signIn(page);
 await expect(page.getByRole('alert')).toContainText('Unable to verify your account type');
 await expect(page.getByRole('main')).toHaveCount(0);
});

test('password recovery remains available at a role-specific entry URL', async ({ page }) => {
  await backend(page, 'Employee');
  await page.goto('/employee/login'); await signIn(page, 'Employee');
  await page.goto('/admin/login?type=recovery');
  await expect(page.getByRole('heading', { name: 'Set a new password', exact: true })).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill('Recovered-password-123!');
  await page.getByLabel('Confirm new password', { exact: true }).fill('Recovered-password-123!');
  await page.getByRole('button', { name: /Update password|Save password/i }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
