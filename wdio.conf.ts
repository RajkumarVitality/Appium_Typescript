import {
  appToUninstall,
  buildCapabilities,
  cloudEndpoint,
  appIdFor,
  deviceDefaults,
  logSharedAppIdWarning,
  selectedPlatform,
  sessionDashboardUrl,
  setSessionNameFromSpecs,
  settingOr,
  shouldOpenLiveSession
} from './src/config/mobileSessionInit.js';
import { executionReporter } from './src/utils/ExecutionReporter.js';
import { closeLiveSessionTab, openInDefaultBrowser } from './src/utils/browserLauncher.js';
import type { MobilePlatform } from './src/config/mobileSessionInit.js';
import { browser } from '@wdio/globals';
import { addAttachment, addLabel, addStep } from '@wdio/allure-reporter';
import { executionTimeouts } from './src/config/timeoutsHandling.js';
import { resolveScenario, scenarios, suites } from './src/config/runner.js';
import { initializeTestAccountsForSpecs } from './tests/helpers/user_helpers/TestUser.js';
import { userCreationSetting } from './src/config/userCreation.js';

const platform: MobilePlatform = selectedPlatform();
const scenario = resolveScenario(settingOr('LT_SCENARIO', 'loginAndLogout'), platform);
const endpoint = cloudEndpoint();
const testScenario = scenarios[scenario];
const timeouts = executionTimeouts();
let liveSessionUrl: string | undefined;

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: [`./tests/${testScenario.file}`],
  suites,
  maxInstances: 1,
  capabilities: [buildCapabilities(platform, scenario, testScenario.name)],
  hostname: endpoint.hostname,
  port: Number(endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80)),
  protocol: endpoint.protocol === 'https:' ? 'https' : 'http',
  path: endpoint.pathname,
  framework: 'mocha',
  reporters: [
    'spec',
    ['allure', {
      outputDir: 'target/allure-results',
      disableWebdriverStepsReporting: true,
      disableWebdriverScreenshotsReporting: true
    }]
  ],
  logLevel: 'info',
  waitforTimeout: timeouts.element,
  connectionRetryTimeout: 180_000,
  connectionRetryCount: 2,
  mochaOpts: {
    ui: 'bdd',
    timeout: timeouts.test,
    retries: 0
  },
  async beforeSession(_config, capabilities, specs) {
    try {
      setSessionNameFromSpecs(capabilities, specs);
      await initializeTestAccountsForSpecs(specs);
    } catch (error) {
      console.error('[UserProvisioning] Pre-session setup failed; stopping worker without opening a mobile session.', error);
      // WebdriverIO logs and swallows hook errors; terminate only this worker.
      process.exit(1);
    }
  },
  async beforeTest(test) {
    addLabel('environment', (userCreationSetting('VG_ENVIRONMENT') ?? 'mdev').toLowerCase());
    executionReporter.startTest(test.parent, test.title, { addAttachment, addStep });
    executionReporter.log('Starting test execution.');
    executionReporter.log(`Timeouts: element=${timeouts.element} ms, test=${timeouts.test} ms.`);
    const dashboardUrl = sessionDashboardUrl(browser.sessionId);
    executionReporter.log(`LambdaTest session ID: ${browser.sessionId}`);
    executionReporter.log(`LambdaTest live/recorded session: ${dashboardUrl}`);
    if (shouldOpenLiveSession()) {
      executionReporter.log('Opening the live session in the default browser (set LT_OPEN_LIVE_SESSION=false to disable).');
      openInDefaultBrowser(dashboardUrl, message => executionReporter.log(message));
      liveSessionUrl = dashboardUrl;
    }
    logSharedAppIdWarning(platform);
    const device = deviceDefaults(platform, scenario);
    await browser.pause(scenario === 'loginAndLogout' && platform === 'Android' ? 7_000 : 4_000);
    await executionReporter.captureTextArtifact(
      'session-config',
      `platform=${platform}\ndevice=${device.device}\nversion=${device.version}\nappId=${appIdFor(platform, scenario)}\nsessionId=${browser.sessionId}\ndashboardUrl=${dashboardUrl}\n`
    );
    await executionReporter.captureScreenshot('app-loaded');
  },
  afterTest: async (_test, _context, result) => {
    if (result.error) {
      executionReporter.log(`Test failed: ${result.error.message}`);
      await executionReporter.captureScreenshot('listener-failure');
      await executionReporter.capturePageSource('listener-failure');
      await executionReporter.finishTest('FAILED');
      return;
    }
    await executionReporter.captureScreenshot('test-passed');
    executionReporter.log('Test passed.');
    await executionReporter.finishTest('PASSED');
  },
  async after() {
    const appId = appToUninstall(platform);
    if (appId) {
      await browser.execute('mobile: removeApp', { appId });
    }
    if (liveSessionUrl) {
      executionReporter.log('Mobile execution complete; closing the live session browser tab/window (best effort).');
      await closeLiveSessionTab(liveSessionUrl, message => executionReporter.log(message));
    }
  },
  onComplete() {
    console.log(`[MobileTestRunner] Finished scenario: ${scenario} (${platform}).`);
  }
};
