import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { decodeBase64Property } from '../../src/config/properties.js';

test('decodes Base64-prefixed LambdaTest credentials and app passwords', () => {
  assert.equal(decodeBase64Property('LT_USERNAME', 'base64:dXNlcg=='), 'user');
  assert.equal(decodeBase64Property('LT_ACCESS_KEY', 'base64:bHRrZXk='), 'ltkey');
  assert.equal(decodeBase64Property('UserName', 'base64:dXNlcg=='), 'user');
  assert.equal(decodeBase64Property('AccessKey', 'base64:bHRrZXk='), 'ltkey');
  assert.equal(decodeBase64Property('APP_PASSWORD', 'base64:cGFzc3dvcmQ='), 'password');
  const password = ' p\u00e4ssword:with=separators ';
  assert.equal(
    decodeBase64Property('APP_PASSWORD', `base64:${Buffer.from(password).toString('base64')}`),
    password
  );
});

test('leaves unencoded and unsupported properties unchanged', () => {
  assert.equal(decodeBase64Property('LT_ACCESS_KEY', 'plain-key'), 'plain-key');
  assert.equal(decodeBase64Property('LT_USERNAME', 'plain-user'), 'plain-user');
  assert.equal(decodeBase64Property('APP_PASSWORD', 'plain-password'), 'plain-password');
  assert.equal(decodeBase64Property('LT_APP_ID', 'base64:dXNlcg=='), 'base64:dXNlcg==');
});

test('rejects malformed Base64 values without including them in the error', () => {
  for (const value of ['', '%%%', 'dXNlcg', 'dXNlcg===', 'dX Nlcg==', 'dXNlcg==\n', 'Zh==', '/w==']) {
    assert.throws(
      () => decodeBase64Property('APP_PASSWORD', `base64:${value}`),
      { message: 'Invalid Base64 value for APP_PASSWORD in lambdatest.properties.' }
    );
  }
});

test('settings decode file credentials while preserving environment precedence and plain values', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mobile-properties-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const configDirectory = path.join(directory, 'src/config');
  await mkdir(configDirectory, { recursive: true });
  await writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
  for (const file of ['properties.ts', 'mobileSessionInit.ts']) {
    await copyFile(new URL(`../../src/config/${file}`, import.meta.url), path.join(configDirectory, file));
  }
  await writeFile(path.join(directory, 'lambdatest.properties'), [
    'LT_USERNAME=base64:dXNlcg==',
    'LT_ACCESS_KEY=base64:bHRrZXk=',
    'APP_PASSWORD=base64:cGFzc3dvcmQ=',
    'UserName=base64:dXNlcg==',
    'AccessKey=base64:bHRrZXk=',
    'APP_USERNAME=plain-app-user'
  ].join('\n'));
  const keys = ['LT_USERNAME', 'LT_ACCESS_KEY', 'APP_PASSWORD', 'UserName', 'AccessKey', 'APP_USERNAME'];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    const { setting, requiredSetting } = await import(
      pathToFileURL(path.join(configDirectory, 'mobileSessionInit.ts')).href
    ) as typeof import('../../src/config/mobileSessionInit.js');
    for (const [key, expected] of [
      ['LT_USERNAME', 'user'], ['LT_ACCESS_KEY', 'ltkey'], ['APP_PASSWORD', 'password'],
      ['UserName', 'user'], ['AccessKey', 'ltkey'], ['APP_USERNAME', 'plain-app-user']
    ]) {
      assert.equal(requiredSetting(key), expected);
      process.env[key] = 'base64:ZW52';
      assert.equal(setting(key), 'base64:ZW52');
      process.env[key] = '  ';
      assert.equal(setting(key), expected);
    }
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
