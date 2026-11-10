import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addDefaultSmokeWorkerLimit,
  parseEnvironmentSelection,
  parsePlatformSelection,
  promptForRunConfiguration
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
  assert.equal(parseEnvironmentSelection('uat'), 'uat');
  assert.equal(parseEnvironmentSelection('production'), undefined);
});

test('asks for tenant, environment, platform and AppId in order, applying the selected profile', async () => {
  for (const profile of ['mdev', 'ca-test', 'ca-dev'] as const) {
    const key = `VG_${profile.toUpperCase().replace('-', '_')}_TENANT_NUMBER`;
    const environment: NodeJS.ProcessEnv = { [key]: '9998', VG_ENVIRONMENT: 'mdev' };
    const prompts: string[] = [];
    const answers = [' 9998 ', profile, '2', ' lt://COMMAND_APP '];
    await promptForRunConfiguration(async prompt => {
      prompts.push(prompt);
      return answers.shift()!;
    }, environment, () => '9998');
    assert.match(prompts[0], /^Enter TENANT_NUMBER/);
    assert.match(prompts[1], /^Select environment/);
    assert.match(prompts[2], /^Select platform/);
    assert.match(prompts[3], /^Enter AppId/);
    assert.equal(prompts.length, 4);
    assert.equal(environment[key], '9998');
    assert.equal(environment.VG_ENVIRONMENT, profile);
    assert.equal(environment.PLATFORM, 'iOS');
    assert.equal(environment.appId, 'lt://COMMAND_APP');
  }
});

test('tenant 34 offers only MDEV and UAT and numbered selection runs UAT', async () => {
  const environment: NodeJS.ProcessEnv = {};
  const answers = ['34', 'ca-test', '2', '1', 'lt://COMMAND_APP'];
  const settings: Record<string, string> = {
    VG_MDEV_TENANT_NUMBER: '34', VG_UAT_TENANT_NUMBER: '34',
    VG_CA_TEST_TENANT_NUMBER: '9998', VG_CA_DEV_TENANT_NUMBER: '9998'
  };
  await promptForRunConfiguration(async prompt => {
    if (prompt.startsWith('Select environment')) {
      assert.match(prompt, /1\. MDEV  2\. UAT/);
      assert.doesNotMatch(prompt, /CA-TEST|CA-DEV/);
    }
    assert.ok(answers.length);
    return answers.shift()!;
  }, environment, key => settings[key]);
  assert.equal(environment.VG_ENVIRONMENT, 'uat');
  assert.equal(environment.VG_UAT_TENANT_NUMBER, '34');
});

test('blank or unknown tenants prompt again and a single match selects automatically', async () => {
  const environment: NodeJS.ProcessEnv = { VG_UAT_TENANT_NUMBER: '34' };
  const answers = ['', 'unknown', '34', '1', 'lt://COMMAND_APP'];
  const prompts: string[] = [];
  await promptForRunConfiguration(async prompt => {
    prompts.push(prompt);
    assert.ok(answers.length);
    return answers.shift()!;
  }, environment, () => undefined);
  assert.equal(prompts.filter(prompt => prompt.startsWith('Enter TENANT')).length, 3);
  assert.ok(prompts.every(prompt => !prompt.startsWith('Select environment')));
  assert.equal(environment.VG_ENVIRONMENT, 'uat');
});

test('requires a terminal AppId and overrides an inherited app ID', async () => {
  const environment: NodeJS.ProcessEnv = { appId: 'lt://OLD_APP', VG_MDEV_TENANT_NUMBER: '34' };
  const answers = ['34', '', '', '  ', 'lt://NEW_APP'];
  const prompts: string[] = [];
  await promptForRunConfiguration(async prompt => {
    prompts.push(prompt);
    assert.ok(answers.length > 0);
    return answers.shift()!;
  }, environment, () => undefined);
  assert.equal(prompts.filter(prompt => prompt.startsWith('Enter AppId')).length, 3);
  assert.equal(environment.appId, 'lt://NEW_APP');
});

test('cancelling the tenant prompt stops selection without changing the configured tenant', async () => {
  const environment = { VG_MDEV_TENANT_NUMBER: '9998' };
  const error = new Error('Selection cancelled');
  await assert.rejects(
    promptForRunConfiguration(async () => { throw error; }, environment),
    error
  );
  assert.equal(environment.VG_MDEV_TENANT_NUMBER, '9998');
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
