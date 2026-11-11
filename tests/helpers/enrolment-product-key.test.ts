import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enrolUser } from '../../src/config/API-to-Create-New-User.js';

for (const [profile, productKey] of [['mdev', '7'], ['uat', '3']]) {
  test(`enrolment uses the ${profile} product key`, async t => {
    const prefix = `VG_${profile.toUpperCase()}_`;
    const settings = {
      VG_ENVIRONMENT: profile,
      [`${prefix}INTEGRATION_PLATFORM_BASE_URL`]: 'https://example.invalid/api',
      [`${prefix}TENANT_NUMBER`]: '34',
      [`${prefix}API_BEARER_TOKEN`]: 'test-token',
      [`${prefix}EMAIL_DOMAIN`]: 'example.invalid',
      [`${prefix}VITALITY_PRODUCT_KEY`]: productKey,
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
    const requests = t.mock.method(globalThis, 'fetch', async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.activateVitalityMembership.product.identifierTypeKey, productKey);
      return Response.json({
        partyRoleOuts: [{ typeKey: 2, partyId: 222, insurerCode: '333' }],
        vitalityMembership: { id: 444 }
      });
    });
    await enrolUser(111);
    assert.equal(requests.mock.callCount(), 1);
  });
}
