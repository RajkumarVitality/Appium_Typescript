import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeTestAccounts, testAccounts } from './TestUser.js';

test('member fixture is provisioned before use and includes the selected login prefix', async t => {
  const settings = {
    VG_ENVIRONMENT: 'mdev',
    VG_MDEV_LOGIN_PREFIX: 'mdev--',
    VG_MDEV_ZUUL_URL: 'http://example.invalid',
    VG_MDEV_INTEGRATION_PLATFORM_BASE_URL: 'https://example.invalid/api',
    VG_MDEV_TENANT_NUMBER: '9998',
    VG_MDEV_EMAIL_DOMAIN: 'example.invalid',
    VG_MDEV_VITALITY_PRODUCT_KEY: '7',
    VG_MDEV_API_BASIC_AUTH: 'test-basic',
    VG_MDEV_API_BEARER_TOKEN: 'test-bearer',
    APP_PASSWORD: 'test-password',
    configUserAgent: 'test-agent'
  };
  for (const [key, value] of Object.entries(settings)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  assert.throws(() => testAccounts.member, /has not been provisioned/);
  const routes: string[] = [];
  let email = '';
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    const route = new URL(url).pathname;
    routes.push(route);
    if (route.endsWith('/createPartyCore/1')) {
      return Response.json({ createPartyCoreResponse: { party: { partyId: 111 } } }, { status: 201 });
    }
    if (route.endsWith('/instructionBasedEnrolment')) {
      email = JSON.parse(String(init.body)).activateVitalityMembership.partyRoles[0].emailAddresses[0].value;
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
  });
  t.mock.method(console, 'log', () => {});
  await initializeTestAccounts();
  assert.equal(testAccounts.member, `mdev--${email}`);
  assert.equal(routes.length, 10);
  assert.ok(routes[3]?.endsWith('/calculateVitalityStatus/444'));
  assert.ok(routes[6]?.endsWith('/captureLoginEvents/222'));
  assert.ok(routes[9]?.endsWith('/deleteUserInstruction'));

  fetchMock.mock.mockImplementation(async () => new Response(null, { status: 500 }));
  await assert.rejects(initializeTestAccounts(), /expected HTTP 201 but received HTTP 500/);
  assert.throws(() => testAccounts.member, /has not been provisioned/);
});
