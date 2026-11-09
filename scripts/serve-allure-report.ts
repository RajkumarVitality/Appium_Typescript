import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openInDefaultBrowser } from '../src/utils/browserLauncher.js';
import { validateAllureDate, type AllureResultFilter } from '../src/utils/allureResultFilter.js';
import { generateFilteredReport } from './generate-allure-report.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resultsDirectory = path.join(projectRoot, 'target/allure-results');
const reportsDirectory = path.join(projectRoot, 'target/allure-filtered-reports');
const port = Number(process.env.ALLURE_REPORT_PORT ?? 4173);
const maximumRequestBytes = 16_384;

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Appium Allure Report</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2937; background: #f3f4f6; }
    body { margin: 0; }
    header { padding: 24px clamp(16px, 4vw, 48px); background: #fff; box-shadow: 0 1px 4px #0002; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    form { display: flex; flex-wrap: wrap; align-items: end; gap: 16px; }
    label { display: grid; gap: 6px; font-size: 13px; font-weight: 600; }
    input, select, button { box-sizing: border-box; min-height: 38px; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 5px; background: white; font: inherit; }
    button { border-color: #2563eb; background: #2563eb; color: white; cursor: pointer; font-weight: 600; }
    button:disabled { opacity: .6; cursor: wait; }
    #status { min-height: 20px; margin: 12px 0 0; font-size: 13px; }
    #report { display: none; width: 100%; height: calc(100vh - 190px); border: 0; background: white; }
  </style>
</head>
<body>
  <header>
    <h1>Allure report filters</h1>
    <form id="filters">
      <label>Start date (inclusive)<input name="fromDate" type="date"></label>
      <label>End date (inclusive)<input name="toDate" type="date"></label>
      <label>Environment
        <select name="environment">
          <option value="">All environments</option>
          <option value="ca-test">ca-test</option>
          <option value="ca-dev">dev (ca-dev)</option>
          <option value="mdev">mdev</option>
        </select>
      </label>
      <button id="generate" type="submit">Generate report</button>
    </form>
    <p id="status" role="status">Choose a date range and environment, then generate the report.</p>
  </header>
  <iframe id="report" title="Filtered Allure report"></iframe>
  <script>
    const form = document.querySelector('#filters');
    const button = document.querySelector('#generate');
    const status = document.querySelector('#status');
    const report = document.querySelector('#report');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      button.disabled = true;
      report.style.display = 'none';
      status.textContent = 'Filtering results and generating the Allure report…';
      const values = new FormData(form);
      try {
        const response = await fetch('/api/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromDate: values.get('fromDate') || undefined,
            toDate: values.get('toDate') || undefined,
            environment: values.get('environment') || undefined
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to generate report.');
        status.textContent = 'Showing ' + result.matched + ' of ' + result.total +
          ' results · ' + (values.get('fromDate') || 'any date') + ' to ' +
          (values.get('toDate') || 'any date') + ' · ' +
          (values.get('environment') || 'all environments');
        report.src = result.reportUrl;
        report.style.display = 'block';
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
      } finally {
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`;

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function readRequestBody(request: IncomingMessage): Promise<unknown> {
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > maximumRequestBytes) {
      throw new Error('Request body is too large.');
    }
  }
  return JSON.parse(body);
}

function parseFilter(input: unknown): AllureResultFilter {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid report filter request.');
  }
  const values = input as Record<string, unknown>;
  const filter: AllureResultFilter = {};
  if (values.fromDate !== undefined) {
    if (typeof values.fromDate !== 'string') throw new Error('Start date must be a YYYY-MM-DD date.');
    filter.fromDate = validateAllureDate(values.fromDate, 'Start date');
  }
  if (values.toDate !== undefined) {
    if (typeof values.toDate !== 'string') throw new Error('End date must be a YYYY-MM-DD date.');
    filter.toDate = validateAllureDate(values.toDate, 'End date');
  }
  if (filter.fromDate && filter.toDate && filter.fromDate > filter.toDate) {
    throw new Error('End date must be on or after the start date.');
  }
  if (values.environment !== undefined) {
    if (typeof values.environment !== 'string' || !['ca-test', 'ca-dev', 'mdev'].includes(values.environment)) {
      throw new Error('Select a valid environment.');
    }
    filter.environment = values.environment;
  }
  return filter;
}

function serveReportFile(requestPath: string, response: ServerResponse): void {
  const match = /^\/reports\/([0-9a-f-]{36})\/(.*)$/.exec(requestPath);
  if (!match) {
    response.writeHead(404).end('Report not found.');
    return;
  }
  const reportDirectory = path.join(reportsDirectory, match[1]);
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(match[2] || 'index.html');
  } catch {
    response.writeHead(400).end('Invalid report path.');
    return;
  }
  const requestedPath = path.resolve(reportDirectory, decodedPath);
  if (!requestedPath.startsWith(`${reportDirectory}${path.sep}`)) {
    response.writeHead(400).end('Invalid report path.');
    return;
  }

  void stat(requestedPath).then(file => {
    if (!file.isFile()) {
      response.writeHead(404).end('Report file not found.');
      return;
    }
    const contentType = requestedPath.endsWith('.js') ? 'text/javascript'
      : requestedPath.endsWith('.css') ? 'text/css'
        : requestedPath.endsWith('.json') ? 'application/json'
          : requestedPath.endsWith('.svg') ? 'image/svg+xml'
            : requestedPath.endsWith('.png') ? 'image/png'
              : requestedPath.endsWith('.woff2') ? 'font/woff2'
                : 'text/html';
    response.writeHead(200, { 'Content-Type': `${contentType}; charset=utf-8` });
    createReadStream(requestedPath).pipe(response);
  }).catch(() => response.writeHead(404).end('Report file not found.'));
}

const server = createServer(async (request, response) => {
  const requestPath = new URL(request.url ?? '/', `http://127.0.0.1:${port}`).pathname;
  if (request.method === 'GET' && requestPath === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(page);
    return;
  }

  if (request.method === 'POST' && requestPath === '/api/report') {
    let filter: AllureResultFilter;
    try {
      filter = parseFilter(await readRequestBody(request));
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : 'Invalid report filter request.'
      });
      return;
    }
    try {
      const reportId = randomUUID();
      const reportDirectory = path.join(reportsDirectory, reportId);
      await mkdir(reportsDirectory, { recursive: true });
      const summary = await generateFilteredReport(resultsDirectory, reportDirectory, filter);
      sendJson(response, 200, { ...summary, reportUrl: `/reports/${reportId}/index.html` });
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : 'Unable to generate filtered report.'
      });
    }
    return;
  }

  if (request.method === 'GET' && requestPath.startsWith('/reports/')) {
    serveReportFile(requestPath, response);
    return;
  }

  response.writeHead(404).end('Not found.');
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`[AllureReport] Filter UI ready at ${url}. Press Ctrl+C to stop the server.`);
  if (process.env.ALLURE_REPORT_NO_OPEN !== 'true') {
    openInDefaultBrowser(url, message => console.warn(`[AllureReport] ${message}`));
  }
});

server.on('error', error => {
  console.error('[AllureReport] Unable to start report filter UI.', error);
  process.exitCode = 1;
});
