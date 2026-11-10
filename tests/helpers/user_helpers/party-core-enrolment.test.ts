import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateVitalityStatus, captureLoginEvents, createPartyCore, enrolUser, getCurrentDateTime, getUserInstruction, loginUser, processEventToCreateReward, registerUser } from '../../src/config/API-to-Create-New-User.js';

test('status calculation uses vitalityMembership.id returned by enrolment', async t => {
  const keys = {
    VG_ENVIRONMENT: 'mdev',
    VG_MDEV_ZUUL_URL: 'http://example.invalid/',
    VG_MDEV_INTEGRATION_PLATFORM_BASE_URL: 'https://example.invalid/api/',
    VG_MDEV_TENANT_NUMBER: '9998',
    VG_MDEV_API_BEARER_TOKEN: 'test-token',
    VG_MDEV_EMAIL_DOMAIN: 'example.invalid',
    VG_MDEV_VITALITY_PRODUCT_KEY: '7',
    configUserAgent: 'test-agent'
  };
  for (const [key, value] of Object.entries(keys)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    if (url.endsWith('/instructionBasedEnrolment')) {
      return Response.json({
        partyRoleOuts: [{ typeKey: 2, partyId: 40189132, insurerCode: '1009199112' }],
        vitalityMembership: { id: 99986587952 }
      });
    }
    assert.equal(url, 'http://example.invalid/vitality-manage-vitality-status-service-1/svc/9998/calculateVitalityStatus/99986587952');
    assert.equal(init.method, 'POST');
    assert.equal(new Headers(init.headers).get('Content-Type'), 'application/json');
    assert.deepEqual(JSON.parse(String(init.body)), { statusPeriodOffset: -1 });
    return new Response(null, { status: 204 });
  });
  const user = await enrolUser(40189053);
  assert.equal((await calculateVitalityStatus(user.vitalityMembershipId)).status, 204);
});

test('reward event uses enrolment party ID and a shared current timestamp', async t => {
  const settings = {
    VG_ENVIRONMENT: 'mdev',
    VG_MDEV_INTEGRATION_PLATFORM_BASE_URL: 'https://example.invalid/api/',
    VG_MDEV_TENANT_NUMBER: '9998',
    VG_MDEV_API_BEARER_TOKEN: 'Bearer test-reward-token'
  };
  for (const [key, value] of Object.entries(settings)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  t.mock.method(Date, 'now', () => Date.parse('2026-10-10T06:11:57.456Z'));
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://example.invalid/api/vitality-manage-rewards-service/1.0/svc/9998/processEventToCreateReward');
    assert.equal(init.method, 'POST');
    const headers = new Headers(init.headers);
    assert.equal(headers.get('Authorization'), 'Bearer test-reward-token');
    assert.equal(headers.get('Content-Type'), 'application/x-www-form-urlencoded');
    assert.deepEqual(JSON.parse(String(init.body)), {
      eventExists: false,
      eventIn: [{
        applicableTo: 40189132,
        eventCapturedOn: '2026-10-10T08:11:57.000+02:00',
        eventOccuredOn: '2026-10-10T08:11:57.000+02:00',
        eventSourceTypeKey: 1,
        reportedBy: 40189132,
        typeKey: 2298
      }]
    });
    return Response.json({ created: true });
  });
  assert.deepEqual(await (await processEventToCreateReward(40189132)).json(), { created: true });
  for (const status of [400, 401, 500]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status }));
    await assert.rejects(processEventToCreateReward(40189132), new RegExp(`failed with HTTP ${status}`));
  }
  for (const id of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(processEventToCreateReward(id), /positive integer enrolment party ID/);
  }
  process.env.VG_MDEV_API_BEARER_TOKEN = '******';
  await assert.rejects(processEventToCreateReward(40189132), /before creating a reward event/);
});

test('current date-time uses UTC+02:00 with fixed zero milliseconds', t => {
  t.mock.method(Date, 'now', () => Date.parse('2026-10-10T09:35:37.456Z'));
  assert.equal(getCurrentDateTime(), '2026-10-10T11:35:37.000+02:00');
  t.mock.method(Date, 'now', () => Date.parse('2026-12-31T23:35:37.999Z'));
  assert.equal(getCurrentDateTime(), '2027-01-01T01:35:37.000+02:00');
});

test('created party ID is used in enrolment with dynamic data and configured headers', async t => {
  const settings = {
    VG_ENVIRONMENT: 'mdev',
    VG_MDEV_ZUUL_URL: 'http://example.invalid/',
    VG_MDEV_INTEGRATION_PLATFORM_BASE_URL: 'https://example.invalid/api/',
    VG_MDEV_TENANT_NUMBER: '9998',
    VG_MDEV_API_BEARER_TOKEN: 'Bearer test-token',
    VG_MDEV_EMAIL_DOMAIN: '@vgnet.testinator.com',
    VG_MDEV_VITALITY_PRODUCT_KEY: '7',
    VG_MDEV_API_BASIC_AUTH: 'Basic test-basic-auth',
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
  const before = new Date().toISOString().slice(0, 10);
  let enrolments = 0;
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(init.method, 'POST');
    if (url.endsWith('/createPartyCore/1')) {
      assert.equal(url, 'http://example.invalid/party-core-management/svc/9998/createPartyCore/1');
      return Response.json({ createPartyCoreResponse: { party: { partyId: 40189053 } } }, { status: 201 });
    }
    enrolments++;
    assert.equal(url, 'https://example.invalid/api/vitality-enrolment-services-service-1/1.0/svc/9998/instructionBasedEnrolment');
    const headers = new Headers(init.headers);
    assert.equal(headers.get('Authorization'), 'Bearer test-token');
    assert.equal(headers.get('User-Agent'), 'test-agent');
    assert.equal(headers.get('SI'), 'Appium');
    assert.equal(headers.get('Content-Type'), 'application/json');
    assert.equal(headers.get('Cookie'), null);
    assert.equal(typeof init.body, 'string');
    const payload = JSON.parse(String(init.body));
    assert.equal(payload.instructionTypeKey, 10);
    const membership = payload.activateVitalityMembership;
    assert.equal(membership.product.identifierTypeKey, '7');
    assert.equal(membership.membershipReferences[0].typeKey, 1);
    assert.match(membership.membershipReferences[0].value, /^[1-9]\d{9}$/);
    const today = membership.effectivePeriod.effectiveFrom;
    assert.ok([before, new Date().toISOString().slice(0, 10)].includes(today));
    assert.equal(membership.effectivePeriod.effectiveTo, '9999-12-31');
    const role = membership.partyRoles[0];
    assert.equal(role.person.genderTypeKey, '2');
    assert.equal(role.person.bornOn, '1995-02-11');
    assert.equal(role.person.titleTypeKey, '3');
    assert.match(role.person.familyName, /^[A-Za-z]+$/);
    assert.ok(['Emma', 'Olivia', 'Sophia', 'Amelia', 'Charlotte', 'Isabella', 'Mia', 'Emily'].includes(role.person.givenName));
    assert.equal(role.userCredential.carrierPartyId, '40189053');
    const email = role.emailAddresses[0].value;
    assert.match(email, new RegExp(`^${role.person.givenName}_\\d{16}@vgnet\\.testinator\\.com$`));
    assert.equal(role.userCredential.value, email);
    assert.equal(role.effectiveFrom, today);
    assert.equal(role.emailAddresses[0].contactRoles[0].effectiveFrom, today);
    assert.equal(role.action, '21');
    assert.equal(membership.externalMembershipIdentification.referenceTypeKey, 4);
    assert.match(membership.externalMembershipIdentification.value, /^\d{16}$/);
    return Response.json({
      partyRoleOuts: [{ typeKey: 2, partyId: 40189132, insurerCode: '1009199112' }],
      vitalityMembership: { id: 99986587952 }
    }, { status: 200 });
  });
  const partyId = await createPartyCore();
  const user = await enrolUser(partyId);
  assert.equal(enrolments, 1);
  assert.equal(user.carrierPartyId, partyId);
  assert.equal(user.email, `${user.firstName}_${user.externalMembershipId}@vgnet.testinator.com`);
  assert.equal(user.userName, user.email);
  assert.equal(user.bornOn, '1995-02-11');
  assert.match(user.membershipReference, /^[1-9]\d{9}$/);
  assert.equal(user.partyId, 40189132);
  assert.equal(user.insurerCode, '1009199112');
  assert.equal(user.vitalityMembershipId, 99986587952);

  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://example.invalid/api/tstc-integration-platform-services-service-v1/1.0/register');
    assert.equal(init.method, 'POST');
    const headers = new Headers(init.headers);
    assert.equal(headers.get('Authorization'), 'Basic test-basic-auth');
    assert.equal(headers.get('User-Agent'), 'test-agent');
    assert.equal(headers.get('Content-Type'), 'application/json');
    assert.equal(headers.get('Cookie'), null);
    assert.deepEqual(JSON.parse(String(init.body)), {
      password: 'test-password',
      registrationCode: 1009199112,
      userName: user.email,
      bornOn: user.bornOn
    });
    return new Response(null, { status: 201 });
  });
  assert.equal((await registerUser(user)).status, 201);
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'http://example.invalid/vitality-manage-vitality-status-service-1/svc/9998/calculateVitalityStatus/99986587952');
    assert.equal(init.method, 'POST');
    assert.equal(new Headers(init.headers).get('Content-Type'), 'application/json');
    assert.deepEqual(JSON.parse(String(init.body)), { statusPeriodOffset: -1 });
    return new Response(null, { status: 204 });
  });
  assert.equal((await calculateVitalityStatus(user.vitalityMembershipId)).status, 204);
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://example.invalid/api/tstc-integration-platform-services-service-v1/1.0/login');
    assert.equal(init.method, 'POST');
    const headers = new Headers(init.headers);
    assert.equal(headers.get('Authorization'), 'Basic test-basic-auth');
    assert.equal(headers.get('User-Agent'), 'test-agent');
    assert.equal(headers.get('Content-Type'), 'application/json');
    assert.deepEqual(JSON.parse(String(init.body)), {
      loginRequest: { password: 'test-password', username: user.userName }
    });
    return Response.json({ authenticated: true });
  });
  assert.deepEqual(await (await loginUser(user.userName)).json(), { authenticated: true });
  const instructions = [
    { typeCode: 'OnboardingReward', id: 128443689 },
    { typeCode: 'ScreenAndVaccDS', id: 128443662 },
    { typeCode: 'OnboardingJourney', id: 128443686 },
    { typeCode: 'LOGIN_T_AND_C', id: 128443661 },
    { typeCode: 'OnboardCommunPref', id: 128443687 },
    { typeCode: 'GTBOnboardingJourney', id: 128443681 }
  ];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'http://example.invalid/vitality-manage-user-service-1/svc/9998/getUserInstruction');
    assert.equal(init.method, 'POST');
    assert.equal(new Headers(init.headers).get('Content-Type'), 'application/x-www-form-urlencoded');
    assert.deepEqual(JSON.parse(String(init.body)), { userId: user.userName });
    return Response.json({ instructions });
  });
  const instructionIds = await getUserInstruction(user.userName);
  assert.deepEqual(instructionIds, {
    LOGIN_T_AND_C_ID: 128443661,
    GTBOnboardingJourney_ID: 128443681,
    OnboardingJourney_ID: 128443686,
    OnboardCommunPref_ID: 128443687,
    OnboardingReward_ID: 128443689
  });
  process.env.VG_MDEV_API_BEARER_TOKEN = 'test-capture-token';
  t.mock.method(Date, 'now', () => Date.parse('2026-10-10T06:11:57.456Z'));
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://example.invalid/api/vitality-manage-user-service-v1/1.0/svc/9998/captureLoginEvents/40189132');
    assert.equal(init.method, 'POST');
    const headers = new Headers(init.headers);
    assert.equal(headers.get('Authorization'), 'Bearer test-capture-token');
    assert.equal(headers.get('User-Agent'), 'test-agent');
    assert.equal(headers.get('Content-Type'), 'application/x-www-form-urlencoded');
    assert.deepEqual(JSON.parse(String(init.body)), {
      loginDate: '2026-10-10T08:11:57.000+02:00',
      loginSuccess: true,
      userInstructionResponses: [{ id: 128443661, typeKey: 1, value: 'true' }]
    });
    return new Response(null, { status: 204 });
  });
  assert.equal((await captureLoginEvents(user.partyId, instructionIds.LOGIN_T_AND_C_ID)).status, 204);
  for (const status of [400, 401, 500]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status }));
    await assert.rejects(captureLoginEvents(user.partyId, instructionIds.LOGIN_T_AND_C_ID), new RegExp(`failed with HTTP ${status}`));
  }
  for (const id of [0, -1, NaN, 1.5]) {
    await assert.rejects(captureLoginEvents(id, instructionIds.LOGIN_T_AND_C_ID), /positive integer enrolment party ID/);
    await assert.rejects(captureLoginEvents(user.partyId, id), /positive integer LOGIN_T_AND_C_ID/);
  }
  process.env.VG_MDEV_API_BEARER_TOKEN = '******';
  await assert.rejects(captureLoginEvents(user.partyId, instructionIds.LOGIN_T_AND_C_ID), /before capturing login events/);
  process.env.VG_MDEV_API_BEARER_TOKEN = 'test-capture-token';
  for (const body of [
    {},
    { instructions: [] },
    { instructions: instructions.slice(1) },
    { instructions: [...instructions, instructions[0]] },
    { instructions: instructions.map(instruction => ({ ...instruction, id: 'invalid' })) }
  ]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(body));
    await assert.rejects(getUserInstruction(user.userName), /Get-user-instruction response/);
  }
  for (const status of [400, 401, 500]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status }));
    await assert.rejects(getUserInstruction(user.userName), new RegExp(`failed with HTTP ${status}`));
  }
  await assert.rejects(getUserInstruction(' '), /non-empty userName/);
  for (const status of [400, 401, 403, 500]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status }));
    await assert.rejects(loginUser(user.userName), new RegExp(`User login request failed with HTTP ${status}`));
  }
  await assert.rejects(loginUser('  '), /non-empty userName/);
  for (const status of [400, 401, 500]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status }));
    await assert.rejects(calculateVitalityStatus(user.vitalityMembershipId), new RegExp(`failed with HTTP ${status}`));
  }
  for (const id of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(calculateVitalityStatus(id), /positive integer vitality membership ID/);
  }
  for (const status of [200, 202, 400, 500]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status }));
    await assert.rejects(registerUser(user), new RegExp(`expected HTTP 201 but received HTTP ${status}`));
  }
  for (const insurerCode of ['', 'abc', '1.2', '9007199254740992']) {
    await assert.rejects(registerUser({ ...user, insurerCode }), /valid numeric insurerCode/);
  }

  for (const status of [201, 202, 400, 500]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status }));
    await assert.rejects(enrolUser(partyId), new RegExp(`expected HTTP 200 but received HTTP ${status}`));
  }
  for (const body of [
    {},
    { partyRoleOuts: [{ typeKey: 2, partyId: 40189132 }] },
    { partyRoleOuts: [{ typeKey: 2, partyId: 40189132, insurerCode: '1009199112' }] },
    {
      partyRoleOuts: [{ typeKey: 2, partyId: 40189132, insurerCode: '1009199112' }],
      vitalityMembership: { id: '99986587952' }
    }
  ]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(body, { status: 200 }));
    await assert.rejects(enrolUser(partyId), /response was missing a valid/);
  }
  for (const invalidId of [0, -1, 1.5, NaN]) {
    await assert.rejects(enrolUser(invalidId), /positive integer carrier party ID/);
  }
  process.env.VG_MDEV_API_BEARER_TOKEN = '******';
  await assert.rejects(enrolUser(partyId), /Provide a valid VG_MDEV_API_BEARER_TOKEN/);

  for (const status of [200, 202, 400, 500]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status }));
    await assert.rejects(createPartyCore(), new RegExp(`expected HTTP 201 but received HTTP ${status}`));
  }
});
