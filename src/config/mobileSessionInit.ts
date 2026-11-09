import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeBase64Property, loadProperties } from './properties.js';

export type MobilePlatform = 'Android' | 'iOS';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fileProperties = loadProperties([
  path.join(projectRoot, 'lambdatest.properties'),
  path.join(projectRoot, 'src/test/resources/lambdatest.properties')
]);

export function setting(key: string): string | undefined {
  const environmentValue = process.env[key]?.trim();
  if (environmentValue) {
    return environmentValue;
  }

  const propertyValue = fileProperties.get(key)?.trim();
  return propertyValue ? decodeBase64Property(key, propertyValue) : undefined;
}

export function requiredSetting(key: string, ...aliases: string[]): string {
  for (const candidate of [key, ...aliases]) {
    const value = setting(candidate);
    if (value) {
      return value;
    }
  }

  throw new Error(
    `Missing required setting: ${key}. Provide it as an environment variable, -D${key}=... argument, or in lambdatest.properties.`
  );
}

export function settingOr(key: string, fallback: string, ...aliases: string[]): string {
  for (const candidate of [key, ...aliases]) {
    const value = setting(candidate);
    if (value) {
      return value;
    }
  }
  return fallback;
}

export function mobilePlatform(value: string): MobilePlatform {
  if (/^ios$/i.test(value)) {
    return 'iOS';
  }
  if (/^android$/i.test(value)) {
    return 'Android';
  }
  throw new Error(`Unsupported mobile platform "${value}". Use Android or iOS.`);
}

export function appIdFor(platform: MobilePlatform, scenario: string): string {
  const platformSpecificKey = platform === 'iOS' ? 'LT_IOS_APP_ID' : 'LT_ANDROID_APP_ID';
  const legacyPlatformKey = platform === 'iOS' ? 'iosAppId' : 'androidAppId';

  const appId = setting('appId')
    ?? setting(platformSpecificKey)
    ?? setting(legacyPlatformKey)
    ?? setting('LT_APP_ID');

  if (!appId) {
    throw new Error(
      `Missing required App ID for scenario "${scenario}" (${platform}). Provide it as an environment variable ` +
      `("appId", "${platformSpecificKey}", "${legacyPlatformKey}", or "LT_APP_ID") or in lambdatest.properties.`
    );
  }

  return appId;
}

export function appToUninstall(platform: MobilePlatform): string | undefined {
  const keys = platform === 'iOS'
    ? ['IOS_BUNDLE_ID', 'LT_IOS_BUNDLE_ID']
    : ['ANDROID_APP_PACKAGE', 'LT_ANDROID_APP_PACKAGE'];
  for (const key of keys) {
    const value = setting(key);
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function logSharedAppIdWarning(platform: MobilePlatform): void {
  const platformKey = platform === 'iOS' ? 'LT_IOS_APP_ID' : 'LT_ANDROID_APP_ID';
  if (setting('LT_APP_ID') && !setting(platformKey)) {
    console.warn(`Using shared LT_APP_ID for ${platform}; set ${platformKey} to select a platform-specific app.`);
  }
}

export function sessionDashboardUrl(sessionId: string): string {
  return `https://appautomation.lambdatest.com/test?testID=${sessionId}`;
}

export function shouldOpenLiveSession(): boolean {
  if (setting('CI')) {
    return false;
  }
  return settingOr('LT_OPEN_LIVE_SESSION', 'true').toLowerCase() !== 'false';
}

export function cloudEndpoint(): URL {
  const configured = settingOr('LT_GRID_URL', 'mobile-hub.lambdatest.com');
  const normalized = configured.includes('://') ? configured : `https://${configured}`;
  const endpoint = new URL(normalized);
  if (!endpoint.pathname.endsWith('/wd/hub')) {
    endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, '')}/wd/hub`;
  }
  return endpoint;
}

export function deviceDefaults(platform: MobilePlatform, scenario = 'android-login'): { device: string; version: string } {
  const defaultDevice = platform === 'iOS' ? 'iPhone .*' : 'Galaxy S.*';
  const defaultVersion = platform === 'iOS' || scenario !== 'android-login' ? '.*' : '14';

  return {
    device: settingOr('device', settingOr('LT_DEVICE', defaultDevice)),
    version: settingOr('version', settingOr('LT_VERSION', defaultVersion))
  };
}

export function selectedPlatform(): MobilePlatform {
  return mobilePlatform(settingOr('PLATFORM', settingOr('platform', 'Android')));
}

export function sessionNameForSpecs(specs: string[]): string {
  if (specs.length !== 1) {
    throw new Error('Each mobile session must receive exactly one spec to determine its scenario name.');
  }
  const specPath = specs[0].startsWith('file:')
    ? fileURLToPath(specs[0])
    : specs[0];
  const fileName = path.basename(specPath);
  if (!fileName.endsWith('.spec.ts')) {
    throw new Error(`Cannot determine mobile scenario name from spec "${fileName}". Expected a .spec.ts file.`);
  }
  const scenarioName = fileName.slice(0, -'.spec.ts'.length);
  const customName = setting('LT_TEST_NAME');
  return customName ? `${customName} - ${scenarioName}` : scenarioName;
}

export function setSessionNameFromSpecs(
  capabilities: unknown,
  specs: string[]
): void {
  if (!capabilities || typeof capabilities !== 'object' || !('LT:Options' in capabilities)) {
    throw new Error('Cannot set mobile scenario name: LT:Options capabilities are missing or invalid.');
  }
  const options = capabilities['LT:Options'];
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('Cannot set mobile scenario name: LT:Options capabilities are missing or invalid.');
  }
  Object.assign(options, { name: sessionNameForSpecs(specs) });
}

export function buildCapabilities(
  platform: MobilePlatform,
  scenario: string,
  testName: string
): WebdriverIO.Capabilities {
  const { device, version } = deviceDefaults(platform, scenario);
  const username = requiredSetting('LT_USERNAME', 'UserName');
  const accessKey = requiredSetting('LT_ACCESS_KEY', 'AccessKey');
  const project = setting('Central Project_Mobile Appium ');
  const app = appIdFor(platform, scenario);
  const ltOptions: Record<string, string | boolean> = {
    username,
    accessKey,
    deviceName: device,
    platformVersion: version,
    app,
    isRealMobile: true,
    build: settingOr('LT_BUILD_NAME', scenario),
    name: settingOr('LT_TEST_NAME', testName),
    fullReset: true,
    noReset: false,
    // Enables video, device, network, and visual (screenshot) logs on the
    // App Automation dashboard for every session.
    video: true,
   // devicelog: true,
   // network: true,
    visual: true
  };
  if (project) {
    ltOptions.project = project;
  }

  return Object.assign({
    platformName: platform,
    'appium:automationName': platform === 'iOS' ? 'XCUITest' : 'UiAutomator2',
    'appium:deviceName': device,
    'appium:platformVersion': version,
    'appium:app': app,
    'appium:fullReset': true,
    'appium:noReset': false,
    //...(platform === 'iOS' ? { 'appium:autoAcceptAlerts': true, 'appium:resignApp': true } : {}),
    ...(platform === 'iOS' ? { 'appium:autoAcceptAlerts': true} : {}),
    'LT:Options': ltOptions
  }, { 'appium:idleTimeout': 1800 });
}

export function getArtifactsRoot(): string {
  return path.resolve(projectRoot, settingOr('LT_ARTIFACTS_DIR', 'target/test-artifacts'));
}

export function artifactTimestamp(date = new Date()): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`;
}

export function sanitizeFileName(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, '-') || 'artifact';
}
