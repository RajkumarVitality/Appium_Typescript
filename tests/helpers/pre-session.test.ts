import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { initializeTestAccountsForSpecs, testAccounts } from './user_helpers/TestUser.js';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

for (const outcome of ['success', 'failure', 'registration-failure', 'login-event-failure', 'screening']) {
  test(`actual beforeSession hook ${outcome} gates mobile session creation`, () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { executeHooksWithArgs } from '@wdio/utils';
      import { config } from './wdio.conf.ts';
      import { testAccounts } from './tests/helpers/user_helpers/TestUser.ts';
      console.log = (...args) => {
        const message = args.join(' ');
        if (message.includes('[UserProvisioning]')) process.stdout.write(message + '\\n');
      };
      let requests = 0;
      globalThis.fetch = async (url) => {
        requests++;
        if (${JSON.stringify(outcome)} === 'failure') return new Response(null, { status: 503 });
        const route = new URL(url).pathname;
        if (${JSON.stringify(outcome)} === 'registration-failure' && route.endsWith('/register')) {
          return new Response(null, { status: 503 });
        }
        if (${JSON.stringify(outcome)} === 'login-event-failure' && route.includes('/captureLoginEvents/')) {
          throw new TypeError('fetch failed', {
            cause: Object.assign(new Error('socket closed'), { code: 'ECONNRESET' })
          });
        }
        if (route.endsWith('/createPartyCore/1')) {
          return Response.json({ createPartyCoreResponse: { party: { partyId: 111 } } }, { status: 201 });
        }
        if (route.endsWith('/instructionBasedEnrolment')) {
          return Response.json({
            partyRoleOuts: [{ typeKey: 2, partyId: 222, insurerCode: '333' }],
            vitalityMembership: { id: 444 }
          });
        }
        if (route.endsWith('/register')) return new Response(null, { status: 201 });
        if (route.endsWith('/getUserInstruction')) {
          return Response.json({
            instructions: ['LOGIN_T_AND_C', 'GTBOnboardingJourney', 'OnboardingJourney', 'OnboardCommunPref', 'OnboardingReward']
              .map((typeCode, index) => ({ typeCode, id: index + 1 }))
          });
        }
        return Response.json({});
      };
      const caps = { 'LT:Options': { name: 'before-session-test' } };
      const spec = ${JSON.stringify(outcome === 'screening'
        ? './tests/regression/screening-vaccination.spec.ts'
        : './tests/regression/mha-unanswered.spec.ts')};
      await executeHooksWithArgs('beforeSession', config.beforeSession, [config, caps, [spec], '0-0']);
      assert.equal(requests, 9);
      assert.match(testAccounts.member, /^mdev--/);
      process.stdout.write('MOBILE_SESSION_CREATION_REACHED');
    `], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 15_000,
      env: {
        ...process.env,
        LT_SCENARIO: 'mha-unanswered',
        PLATFORM: 'iOS',
        LT_USERNAME: 'test-user',
        LT_ACCESS_KEY: 'test-key',
        appId: 'lt://test-app',
        LT_GRID_URL: 'https://example.invalid/wd/hub',
        LT_WAIT_SECONDS: '10',
        LT_TEST_TIMEOUT_SECONDS: '20',
        VG_ENVIRONMENT: 'mdev',
        VG_MDEV_LOGIN_PREFIX: 'mdev--',
        VG_MDEV_ZUUL_URL: 'https://example.invalid',
        VG_MDEV_INTEGRATION_PLATFORM_BASE_URL: 'https://example.invalid/api',
        VG_MDEV_TENANT_NUMBER: '9998',
        VG_MDEV_EMAIL_DOMAIN: 'example.invalid',
        VG_MDEV_VITALITY_PRODUCT_KEY: '7',
        VG_MDEV_API_BASIC_AUTH: 'test-basic',
        VG_MDEV_API_BEARER_TOKEN: 'test-bearer',
        APP_PASSWORD: 'test-password',
        configUserAgent: 'test-agent'
      }
    });
    assert.ifError(result.error);
    assert.doesNotMatch(result.stdout + result.stderr, /\{tenant\}/);
    assert.match(result.stdout, /POST https:\/\/example\.invalid\/party-core-management\/svc\/9998\/createPartyCore\/1/);
    if (outcome.endsWith('failure')) {
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stdout.includes('MOBILE_SESSION_CREATION_REACHED'), false);
      assert.match(result.stderr, /stopping worker without opening a mobile session/);
      const failedStep = outcome === 'registration-failure' ? 'Registration'
        : outcome === 'login-event-failure' ? 'Capture login events' : 'Party creation';
      assert.match(result.stderr, new RegExp(`\\[UserProvisioning\\]\\[mdev\\] ${failedStep} \\| POST https://example\\.invalid/.* \\| FAILED`));
      assert.doesNotMatch(result.stdout, /Member ready/);
      assert.doesNotMatch(result.stderr, /test-basic|test-bearer|test-password/);
      if (outcome === 'login-event-failure') {
        assert.match(result.stderr, /Capture-login-events request failed/);
        assert.match(result.stderr, /ECONNRESET/);
      } else {
        assert.match(result.stderr, /expected HTTP 201 but received HTTP 503/);
      }
    } else {
      assert.equal(result.status, 0, result.stderr);
      assert.ok(result.stdout.includes('MOBILE_SESSION_CREATION_REACHED'));
      assert.equal((result.stdout.match(/\| START/g) ?? []).length, 9);
      assert.equal((result.stdout.match(/\| SUCCESS/g) ?? []).length, 9);
      assert.match(result.stdout, /Registration .* \| SUCCESS \| HTTP 201/);
      assert.match(result.stdout, /POST https:\/\/example\.invalid\/api\/tstc-integration-platform-services-service-v1\/1\.0\/register/);
      assert.match(result.stdout, /POST https:\/\/example\.invalid\/vitality-manage-vitality-status-service-1\/svc\/9998/);
      assert.match(result.stdout, /POST https:\/\/example\.invalid\/vitality-manage-user-service-1\/svc\/9998\/getUserInstruction/);
      assert.doesNotMatch(result.stderr, /\| FAILED/);
    }
  });
}

test('unregistered or grouped specs reject before issuing provisioning requests', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({}));
  await assert.rejects(initializeTestAccountsForSpecs([]), /exactly one spec/);
  await assert.rejects(initializeTestAccountsForSpecs(['a.spec.ts', 'b.spec.ts']), /exactly one spec/);
  await assert.rejects(initializeTestAccountsForSpecs(['unknown.spec.ts']), /No provisioning policy/);
  assert.equal(fetch.mock.callCount(), 0);
  assert.throws(() => testAccounts.member, /has not been provisioned/);
});
