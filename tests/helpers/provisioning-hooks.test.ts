import assert from 'node:assert/strict';
import { test } from 'node:test';
import Mocha from 'mocha';
import { _setGlobal } from '@wdio/globals';
import { executionReporter } from '../../src/utils/ExecutionReporter.js';
import { WelcomeScreen } from '../../src/pages/WelcomeScreen.js';
import { HealthyLivingScreen } from '../../src/pages/HealthyLivingScreen.js';
import { LoginScreen } from '../../src/pages/LoginScreen.js';
import { HomeScreen } from '../../src/pages/HomeScreen.js';
import { ActivityScreen } from '../../src/pages/ActivityScreen.js';
import { ScreeningVaccinationScreen } from '../../src/pages/ScreeningVaccinationScreen.js';
import { MobileSession } from '../../src/utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { initializeTestAccountsForSpecs, testAccounts } from './user_helpers/TestUser.js';

for (const file of ['login-logout', 'mha-low-risk', 'mha-high-risk', 'incorrect-password-lockout', 'mha-unanswered', 'mha-exit-partial', 'screening-vaccination']) {
  const outcomes = file === 'incorrect-password-lockout'
    ? ['success', 'api-error', 'same-password']
    : file === 'screening-vaccination'
      ? ['success', 'success-ios', 'api-error']
      : ['success', 'api-error'];
  for (const outcome of outcomes) {
    const succeeds = outcome === 'success' || outcome === 'success-ios';
    test(`${file} pre-session provisioning: ${outcome}`, async t => {
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
        INCORRECT_APP_PASSWORD: outcome === 'same-password' ? 'test-password' : 'intentionally-wrong-password',
        PLATFORM: outcome === 'success-ios' ? 'iOS' : 'Android',
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
      let email = '';
      const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
        if (!succeeds) return new Response(null, { status: 500 });
        const route = new URL(url).pathname;
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
      const usernames: string[] = [];
      const passwords: string[] = [];
      let submits = 0;
      let incorrectMessages = 0;
      let lockoutMessages = 0;
      if (file === 'incorrect-password-lockout' || file === 'screening-vaccination') {
        const session = new MobileSession('Android');
        const healthyLiving = new HealthyLivingScreen(session);
        const loginScreen = new LoginScreen(session);
        _setGlobal('browser', { pause: async () => {} });
        t.mock.method(executionReporter, 'log', () => {});
        t.mock.method(executionReporter, 'captureScreenshot', async () => undefined);
        t.mock.method(WelcomeScreen.prototype, 'assertWelcomeMessage', async () => {});
        t.mock.method(WelcomeScreen.prototype, 'openHealthyLiving', async () => healthyLiving);
        t.mock.method(HealthyLivingScreen.prototype, 'assertHealthyLivingMessage', async () => {});
        t.mock.method(HealthyLivingScreen.prototype, 'openLogin', async () => loginScreen);
        t.mock.method(LoginScreen.prototype, 'assertHelloVisible', async () => {});
        t.mock.method(LoginScreen.prototype, 'enterUsername', async (username: string) => {
          usernames.push(username);
        });
        t.mock.method(LoginScreen.prototype, 'enterPassword', async (password: string) => {
          passwords.push(password);
        });
        t.mock.method(LoginScreen.prototype, 'dismissKeyboard', async () => {});
        t.mock.method(LoginScreen.prototype, 'submit', async () => { submits++; });
        t.mock.method(LoginScreen.prototype, 'assertIncorrectPasswordMessage', async () => { incorrectMessages++; });
        t.mock.method(LoginScreen.prototype, 'gotItButton', async () => {});
        t.mock.method(LoginScreen.prototype, 'assertLockoutMessage', async () => { lockoutMessages++; });
        t.mock.method(LoginScreen.prototype, 'dismissLockoutMessage', async () => {});
      }
      if (file === 'screening-vaccination') {
        const session = new MobileSession('Android');
        const activity = new ActivityScreen(session);
        const form = new ScreeningVaccinationScreen(session);
        t.mock.method(HomeScreen.prototype, 'dismissNotificationPopup', async () => {});
        t.mock.method(HomeScreen.prototype, 'acceptPermissionDialog', async () => {});
        t.mock.method(HomeScreen.prototype, 'assertGreetingVisible', async () => {});
        t.mock.method(HomeScreen.prototype, 'openActivityTab', async () => activity);
        t.mock.method(ActivityScreen.prototype, 'assertActivityHeader', async () => activity);
        t.mock.method(ActivityScreen.prototype, 'openScreeningVaccinationFeedcard', async () => form);
        for (const method of [
          'openSubmissionForm', 'acceptDataPrivacyNotice', 'assertFormLoaded',
          'assertProofUploadControlVisible', 'selectFluType', 'selectCurrentDate',
          'submitForm', 'assertSubmissionBlockedWithoutProof', 'uploadPngFromDevice',
          'assertSubmissionSuccessful', 'tapDone'
        ] as const) {
          t.mock.method(ScreeningVaccinationScreen.prototype, method, async () => {});
        }
      }

      const mocha = new Mocha({ reporter: Mocha.reporters.Base, timeout: 5_000 });
      const uiGlobals = [
        'before', 'after', 'beforeEach', 'afterEach', 'describe', 'xdescribe',
        'context', 'xcontext', 'it', 'xit', 'specify', 'xspecify'
      ];
      const globalDescriptors = new Map(uiGlobals.map(key => [
        key, Object.getOwnPropertyDescriptor(globalThis, key)
      ]));
      mocha.suite.emit('pre-require', globalThis, file, mocha);
      t.after(() => {
        for (const [key, descriptor] of globalDescriptors) {
          if (descriptor) Object.defineProperty(globalThis, key, descriptor);
          else Reflect.deleteProperty(globalThis, key);
        }
        mocha.dispose();
      });
      const pack = ['login-logout', 'mha-high-risk'].includes(file) ? 'smoke' : 'regression';
      const specUrl = new URL(`../${pack}/${file}.spec.ts`, import.meta.url);
      await import(`${specUrl.href}?provisioning=${outcome}`);
      let mobileSessionsStarted = 0;
      if (!succeeds) {
        await assert.rejects(initializeTestAccountsForSpecs([specUrl.href]), outcome === 'same-password'
          ? /INCORRECT_APP_PASSWORD must differ from APP_PASSWORD/
          : /expected HTTP 201 but received HTTP 500/);
        assert.throws(() => testAccounts.member, /has not been provisioned/);
        assert.equal(mobileSessionsStarted, 0);
        if (outcome === 'same-password') assert.equal(fetchMock.mock.callCount(), 0);
        return;
      }
      await initializeTestAccountsForSpecs([specUrl.href]);
      assert.equal(fetchMock.mock.callCount(), 9);
      mobileSessionsStarted++;
      let bodiesRun = 0;
      let registeredTests = 0;
      mocha.suite.eachTest(mobileTest => {
        registeredTests++;
        const originalBody = mobileTest.fn;
        mobileTest.fn = async () => {
          bodiesRun++;
          assert.equal(testAccounts.member, `mdev--${email}`);
          assert.equal(fetchMock.mock.callCount(), 9);
          if (file === 'incorrect-password-lockout' || file === 'screening-vaccination') {
            assert.ok(originalBody);
            assert.ok(mobileTest.ctx);
            await originalBody.call(mobileTest.ctx, error => {
              if (error) throw error;
            });
          }
        };
      });
      assert.equal(registeredTests, 1);
      const failures = await new Promise<number>(resolve => {
        mocha.run(resolve);
      });
      assert.equal(failures, 0);
      assert.equal(bodiesRun, 1);
      assert.equal(fetchMock.mock.callCount(), 9);
      assert.equal(mobileSessionsStarted, 1);
      if (file === 'screening-vaccination') {
        assert.deepEqual(usernames, [`mdev--${email}`]);
        assert.deepEqual(passwords, ['test-password']);
        assert.equal(submits, 1);
      }
      if (file === 'incorrect-password-lockout' && succeeds) {
        assert.deepEqual(usernames, [`mdev--${email}`]);
        assert.deepEqual(passwords, ['intentionally-wrong-password']);
        assert.equal(submits, 6);
        assert.equal(incorrectMessages, 5);
        assert.equal(lockoutMessages, 1);
      }
    });
  }
}
