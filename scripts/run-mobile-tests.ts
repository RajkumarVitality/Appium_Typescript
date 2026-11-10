import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { userCreationSetting } from '../src/config/userCreation.js';

export type MobileEnvironment = 'ca-test' | 'ca-dev' | 'mdev' | 'uat';
const mobileEnvironments: MobileEnvironment[] = ['ca-test', 'ca-dev', 'mdev', 'uat'];

export function parsePlatformSelection(value: string): 'Android' | 'iOS' | undefined {
  switch (value.trim().toLowerCase()) {
    case '1':
    case 'android':
      return 'Android';
    case '2':
    case 'ios':
      return 'iOS';
    default:
      return undefined;
  }
}

export function parseEnvironmentSelection(value: string): MobileEnvironment | undefined {
  switch (value.trim().toLowerCase()) {
    case '1':
    case 'ca-test':
      return 'ca-test';
    case '2':
    case 'dev':
    case 'ca-dev':
      return 'ca-dev';
    case '3':
    case 'mdev':
      return 'mdev';
    case '4':
    case 'uat':
      return 'uat';
    default:
      return undefined;
  }
}

export function addDefaultSmokeWorkerLimit(args: string[]): string[] {
  const suiteIndex = args.findIndex((argument, index) =>
    argument === '--suite' && args[index + 1] === 'smoke'
    || argument === '--suite=smoke'
  );
  const hasMaxInstances = args.some(argument =>
    argument === '--maxInstances' || argument.startsWith('--maxInstances=')
  );
  return suiteIndex >= 0 && !hasMaxInstances
    ? [...args, '--maxInstances', '5']
    : args;
}

export async function promptForRunConfiguration(
  question: (prompt: string) => Promise<string>,
  environment: NodeJS.ProcessEnv,
  setting: (key: string) => string | undefined = userCreationSetting
): Promise<void> {
  let tenant: string;
  let matches: MobileEnvironment[];
  do {
    tenant = (await question('Enter TENANT_NUMBER: ')).trim();
    matches = mobileEnvironments.filter(profile => {
      const key = `VG_${profile.toUpperCase().replace('-', '_')}_TENANT_NUMBER`;
      return tenant && (environment[key]?.trim() || setting(key)?.trim()) === tenant;
    });
    if (!matches.length) {
      console.log('No environment matches TENANT_NUMBER. Enter a tenant configured in user-creation.properties.');
    }
  } while (!matches.length);
  const defaultPlatform = parsePlatformSelection(environment.PLATFORM ?? '') ?? 'Android';
  const defaultEnvironment = parseEnvironmentSelection(environment.VG_ENVIRONMENT ?? '') ?? 'mdev';
  const defaultProfile = matches.includes(defaultEnvironment) ? defaultEnvironment : matches[0];
  const profile = matches.length === 1 ? matches[0] : await askUntilValid(
    question,
    `Select environment for tenant ${tenant}: ${matches.map((value, index) => `${index + 1}. ${value.toUpperCase()}`).join('  ')} [${matches.indexOf(defaultProfile) + 1}]: `,
    value => {
      const named = parseEnvironmentSelection(value);
      if (/^\d+$/.test(value)) return matches[Number(value) - 1];
      return named && matches.includes(named) ? named : undefined;
    },
    defaultProfile
  );
  const platform = await askUntilValid(
    question,
    `Select platform: 1. Android  2. iOS [${defaultPlatform === 'Android' ? '1' : '2'}]: `,
    parsePlatformSelection,
    defaultPlatform
  );
  let appId: string;
  do {
    appId = (await question('Enter AppId (lt://...): ')).trim();
    if (!appId) {
      console.log('AppId is required. Enter the uploaded app ID.');
    }
  } while (!appId);
  environment.PLATFORM = platform;
  environment.VG_ENVIRONMENT = profile;
  environment.appId = appId;
  environment[`VG_${profile.toUpperCase().replace('-', '_')}_TENANT_NUMBER`] = tenant;
}

async function askUntilValid<T>(
  question: (prompt: string) => Promise<string>,
  prompt: string,
  parse: (value: string) => T | undefined,
  fallback: T
): Promise<T> {
  while (true) {
    const answer = (await question(prompt)).trim();
    if (!answer) {
      return fallback;
    }
    const selection = parse(answer);
    if (selection !== undefined) {
      return selection;
    }
    console.log('Invalid selection. Enter one of the listed numbers or names.');
  }
}

async function main(): Promise<void> {
  const environment = { ...process.env };
  if (process.stdin.isTTY && process.stdout.isTTY) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      await promptForRunConfiguration(
        message => prompt.question(message),
        environment
      );
    } finally {
      prompt.close();
    }
  }

  const cliEntry = fileURLToPath(import.meta.resolve('@wdio/cli'));
  const cliPath = path.resolve(path.dirname(cliEntry), '../bin/wdio.js');
  const runnerArguments = addDefaultSmokeWorkerLimit(process.argv.slice(2));
  const child = spawn(process.execPath, [cliPath, 'run', './wdio.conf.ts', ...runnerArguments], {
    env: environment,
    stdio: 'inherit'
  });
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  process.exitCode = exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ABORT_ERR') {
      console.error('[MobileTestRunner] Selection cancelled; no tests were started.');
    } else {
      console.error('[MobileTestRunner] Unable to select or launch a test run.', error);
    }
    process.exitCode = 1;
  });
}
