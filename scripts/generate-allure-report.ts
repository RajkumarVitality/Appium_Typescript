import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createFilteredAllureResults,
  type AllureResultFilter
} from '../src/utils/allureResultFilter.js';

export async function generateFilteredReport(
  resultsDirectory: string,
  reportDirectory: string,
  filter: AllureResultFilter
): Promise<{ matched: number; total: number }> {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'appium-allure-filter-'));
  try {
    const summary = await createFilteredAllureResults(resultsDirectory, temporaryDirectory, filter);
    await new Promise<void>((resolve, reject) => {
      const allure = spawn('allure', ['generate', temporaryDirectory, '--clean', '-o', reportDirectory], {
        stdio: 'inherit',
        shell: process.platform === 'win32'
      });
      allure.once('error', reject);
      allure.once('close', (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`Allure report generation failed${signal ? ` (${signal})` : ` with exit code ${code}`}.`));
      });
    });
    return summary;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
