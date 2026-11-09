import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface AllureResultFilter {
  fromDate?: string;
  toDate?: string;
  environment?: string;
}

interface AllureAttachment {
  name?: string;
}

interface AllureTestResult {
  uuid?: string;
  start?: number;
  labels?: Array<{ name?: string; value?: string }>;
  attachments?: AllureAttachment[];
}

interface AllureFixture {
  attachments?: AllureAttachment[];
}

interface AllureContainer {
  children?: string[];
  befores?: AllureFixture[];
  afters?: AllureFixture[];
}

export function validateAllureDate(value: string, option: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || Number.isNaN(date.getTime())
    || date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${option} must be a valid date in YYYY-MM-DD format.`);
  }
  return value;
}

export function matchesAllureResult(
  result: AllureTestResult,
  filter: AllureResultFilter
): boolean {
  if (filter.environment) {
    const environment = result.labels?.find(label => label.name === 'environment')?.value;
    if (environment?.toLowerCase() !== filter.environment.toLowerCase()) {
      return false;
    }
  }

  if (filter.fromDate || filter.toDate) {
    if (typeof result.start !== 'number' || !Number.isFinite(result.start)) {
      return false;
    }
    const day = new Date(result.start).toISOString().slice(0, 10);
    if (filter.fromDate && day < filter.fromDate) {
      return false;
    }
    if (filter.toDate && day > filter.toDate) {
      return false;
    }
  }

  return true;
}

function attachmentNames(fixtures: AllureFixture[] | undefined): string[] {
  return (fixtures ?? []).flatMap(fixture => fixture.attachments ?? [])
    .flatMap(attachment => attachment.name ? [attachment.name] : []);
}

async function copyAttachments(
  names: Iterable<string>,
  sourceDirectory: string,
  outputDirectory: string
): Promise<void> {
  for (const name of new Set(names)) {
    if (path.basename(name) !== name) {
      throw new Error('Allure result contains an invalid attachment path.');
    }
    await copyFile(path.join(sourceDirectory, name), path.join(outputDirectory, name));
  }
}

export async function createFilteredAllureResults(
  sourceDirectory: string,
  outputDirectory: string,
  filter: AllureResultFilter
): Promise<{ matched: number; total: number }> {
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  const resultFiles = entries.filter(entry => entry.isFile() && entry.name.endsWith('-result.json'));
  if (resultFiles.length === 0) {
    throw new Error(`No Allure test results found in ${sourceDirectory}.`);
  }

  const results = await Promise.all(resultFiles.map(async entry => ({
    name: entry.name,
    result: JSON.parse(await readFile(path.join(sourceDirectory, entry.name), 'utf8')) as AllureTestResult
  })));
  const selected = results.filter(({ result }) => matchesAllureResult(result, filter));
  if (selected.length === 0) {
    throw new Error('No Allure test results match the selected date range and environment.');
  }

  await mkdir(outputDirectory, { recursive: true });
  const selectedUuids = new Set(selected.flatMap(({ result }) => result.uuid ? [result.uuid] : []));
  const attachments = selected.flatMap(({ result }) =>
    (result.attachments ?? []).flatMap(attachment => attachment.name ? [attachment.name] : [])
  );

  for (const { name, result } of selected) {
    await writeFile(path.join(outputDirectory, name), JSON.stringify(result), 'utf8');
  }

  const containerFiles = entries.filter(entry => entry.isFile() && entry.name.endsWith('-container.json'));
  for (const entry of containerFiles) {
    const container = JSON.parse(await readFile(path.join(sourceDirectory, entry.name), 'utf8')) as AllureContainer;
    const children = (container.children ?? []).filter(uuid => selectedUuids.has(uuid));
    if (children.length === 0) {
      continue;
    }
    await writeFile(
      path.join(outputDirectory, entry.name),
      JSON.stringify({ ...container, children }),
      'utf8'
    );
    attachments.push(...attachmentNames(container.befores), ...attachmentNames(container.afters));
  }

  await copyAttachments(attachments, sourceDirectory, outputDirectory);
  return { matched: selected.length, total: results.length };
}
