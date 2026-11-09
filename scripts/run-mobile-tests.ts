import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type MobileEnvironment = 'ca-test' | 'ca-dev' | 'mdev';

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
      const defaultPlatform = parsePlatformSelection(environment.PLATFORM ?? '') ?? 'Android';
      const defaultEnvironment = parseEnvironmentSelection(environment.VG_ENVIRONMENT ?? '') ?? 'mdev';
      environment.PLATFORM = await askUntilValid(
        message => prompt.question(message),
        `Select platform: 1. Android  2. iOS [${defaultPlatform === 'Android' ? '1' : '2'}]: `,
        parsePlatformSelection,
        defaultPlatform
      );
      environment.VG_ENVIRONMENT = await askUntilValid(
        message => prompt.question(message),
        `Select environment: 1. ca-test  2. dev  3. mdev [${defaultEnvironment === 'ca-test' ? '1' : defaultEnvironment === 'ca-dev' ? '2' : '3'}]: `,
        parseEnvironmentSelection,
        defaultEnvironment
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
