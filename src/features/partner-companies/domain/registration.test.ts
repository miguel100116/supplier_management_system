import test from 'node:test';
import assert from 'node:assert/strict';
import { registrationBranches, registrationType } from './registration';
import { parseApplicationRecordPayload } from '../../../services/applicationRecordSchemas';

const company = { id: 'test', type: 'Courier' as const };
test('registration stores only applicable branches and requires an explicit NT code', () => {
  for (const type of ['Trade', 'Non-Trade', 'Both'] as const) {
    const branches = registrationBranches(company, type, 'BP1', 'BP2');
    assert.equal(registrationType({ branches }), type);
    assert.equal(branches.length, type === 'Both' ? 2 : 1);
  }
  assert.throws(() => registrationBranches(company, 'Both', 'BP1', ' '), /required/);
  assert.throws(() => registrationBranches(company, 'Both', 'BP1', 'bp1'), /different/);
});
test('editing retains branch identities, documents and additional branches', () => {
  const documents = { SIF: { provided: true } };
  const branches = [{ id: 'a', bpCode: 'BP1', documents }, { id: 'b', bpCode: 'BP2-NT', documents }, { id: 'c', bpCode: 'BP3' }];
  const result = registrationBranches({ ...company, branches }, 'Both', 'NEW1', 'NEW2');
  assert.deepEqual(result.map((branch) => branch.id), ['a', 'b', 'c']);
  assert.equal(result[0].documents, documents);
  assert.equal(result[1].documents, documents);
  assert.equal(registrationType({ branches: result }), 'Both');
  assert.throws(() => registrationBranches({ ...company, branches }, 'Trade', 'NEW1', ''), /saved details or documents/);
  assert.equal(branches[0].bpCode, 'BP1');
});
test('legacy classification uses branch category as well as NT code suffix', () => {
  assert.equal(registrationType({ branches: [{ id: 'a', bpCode: 'ANY', rawCategory: 'Courier-NT' }] }), 'Non-Trade');
  assert.equal(registrationType({}), 'Trade');
});

test('registration payload survives persistence validation and rejects unknown types', () => {
  const payload = { ...company, name: 'Test', createdAt: '2026-11-05T00:00:00Z', registrationType: 'Non-Trade', branches: registrationBranches(company, 'Non-Trade', '', 'NT-1') };
  assert.deepEqual(parseApplicationRecordPayload('partner_company', JSON.parse(JSON.stringify(payload)), company.id), payload);
  assert.throws(() => parseApplicationRecordPayload('partner_company', { ...payload, registrationType: 'Invalid' }, company.id), /registrationType/);
});
