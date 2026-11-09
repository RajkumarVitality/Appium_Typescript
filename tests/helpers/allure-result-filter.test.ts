import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  createFilteredAllureResults,
  matchesAllureResult,
  validateAllureDate
} from '../../src/utils/allureResultFilter.js';

test('validates report date filters strictly', () => {
  assert.equal(validateAllureDate('2026-10-22', '--from'), '2026-10-22');
  assert.throws(() => validateAllureDate('2026-02-30', '--to'), /valid date in YYYY-MM-DD/);
  assert.throws(() => validateAllureDate('22-10-2026', '--from'), /valid date in YYYY-MM-DD/);
});

test('matches Allure results by inclusive UTC date range and environment label', () => {
  const result = {
    start: Date.parse('2026-10-22T23:59:00.000Z'),
    labels: [{ name: 'environment', value: 'ca-dev' }]
  };
  assert.equal(matchesAllureResult(result, { fromDate: '2026-10-22', toDate: '2026-10-22' }), true);
  assert.equal(matchesAllureResult(result, { environment: 'CA-DEV' }), true);
  assert.equal(matchesAllureResult(result, { environment: 'dev' }), false);
  assert.equal(matchesAllureResult(result, { toDate: '2026-10-21' }), false);
  assert.equal(matchesAllureResult({}, { fromDate: '2026-10-22' }), false);
});

test('copies only matching results, related containers, and their attachments', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'allure-filter-test-'));
  const source = path.join(directory, 'source');
  const output = path.join(directory, 'filtered');
  await mkdir(source);
  t.after(() => rm(directory, { recursive: true, force: true }));

  await writeFile(path.join(source, 'android-result.json'), JSON.stringify({
    uuid: 'android',
    start: Date.parse('2026-10-22T10:00:00.000Z'),
    labels: [{ name: 'environment', value: 'mdev' }],
    attachments: [{ name: 'android.png' }]
  }));
  await writeFile(path.join(source, 'ios-result.json'), JSON.stringify({
    uuid: 'ios',
    start: Date.parse('2026-10-21T10:00:00.000Z'),
    labels: [{ name: 'environment', value: 'ca-test' }],
    attachments: [{ name: 'ios.png' }]
  }));
  await writeFile(path.join(source, 'setup-container.json'), JSON.stringify({
    children: ['android', 'ios'],
    befores: [{ attachments: [{ name: 'setup.txt' }] }]
  }));
  await writeFile(path.join(source, 'android.png'), 'screenshot');
  await writeFile(path.join(source, 'ios.png'), 'other screenshot');
  await writeFile(path.join(source, 'setup.txt'), 'setup log');

  const summary = await createFilteredAllureResults(source, output, {
    fromDate: '2026-10-22',
    toDate: '2026-10-22',
    environment: 'mdev'
  });
  assert.deepEqual(summary, { matched: 1, total: 2 });
  assert.deepEqual((await readdir(output)).sort(), [
    'android-result.json',
    'android.png',
    'setup-container.json',
    'setup.txt'
  ]);
  const container = JSON.parse(await readFile(path.join(output, 'setup-container.json'), 'utf8')) as { children: string[] };
  assert.deepEqual(container.children, ['android']);
});

test('fails clearly when no results match the selected filter', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'allure-filter-empty-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'one-result.json'), JSON.stringify({
    uuid: 'one',
    start: Date.parse('2026-10-21T10:00:00.000Z'),
    labels: [{ name: 'environment', value: 'mdev' }]
  }));
  await assert.rejects(
    createFilteredAllureResults(directory, path.join(directory, 'filtered'), { environment: 'ca-test' }),
    /No Allure test results match/
  );
});
