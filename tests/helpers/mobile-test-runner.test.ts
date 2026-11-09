import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addDefaultSmokeWorkerLimit,
  parseEnvironmentSelection,
  parsePlatformSelection
} from '../../scripts/run-mobile-tests.js';

test('parses numbered or named platform selections', () => {
  assert.equal(parsePlatformSelection('1'), 'Android');
  assert.equal(parsePlatformSelection('2'), 'iOS');
  assert.equal(parsePlatformSelection(' ios '), 'iOS');
  assert.equal(parsePlatformSelection('3'), undefined);
});

test('maps the requested environments to configured profile names', () => {
  assert.equal(parseEnvironmentSelection('1'), 'ca-test');
  assert.equal(parseEnvironmentSelection('2'), 'ca-dev');
  assert.equal(parseEnvironmentSelection('dev'), 'ca-dev');
  assert.equal(parseEnvironmentSelection('3'), 'mdev');
  assert.equal(parseEnvironmentSelection('production'), undefined);
});

test('defaults smoke runs to five workers without duplicating an explicit limit', () => {
  assert.deepEqual(
    addDefaultSmokeWorkerLimit(['--suite', 'smoke']),
    ['--suite', 'smoke', '--maxInstances', '5']
  );
  assert.deepEqual(
    addDefaultSmokeWorkerLimit(['--suite', 'smoke', '--maxInstances', '2']),
    ['--suite', 'smoke', '--maxInstances', '2']
  );
  assert.deepEqual(
    addDefaultSmokeWorkerLimit(['--suite=smoke', '--maxInstances=2']),
    ['--suite=smoke', '--maxInstances=2']
  );
  assert.deepEqual(addDefaultSmokeWorkerLimit(['--suite', 'regression']), ['--suite', 'regression']);
});
