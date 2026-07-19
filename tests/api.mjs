import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from '../server/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'src', 'data', 'test-fixtures');
const windFixture = JSON.parse(readFileSync(join(FIXTURE_DIR, 'wind-beam-reach.json'), 'utf-8'));

const stubFetchWindGrid = async () => windFixture;

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`PASS: ${name}`);
    passed++;
  } else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function withServer(fn) {
  const app = createServer({ fetchWindGridFn: stubFetchWindGrid });
  const server = app.listen(0);
  const port = await new Promise(resolve => server.once('listening', () => resolve(server.address().port)));
  try {
    await fn(`http://localhost:${port}`);
  } finally {
    server.close();
  }
}

const REQUIRED_FIELDS = ['summary', 'configBlocks', 'legs', 'decisions', 'narration', 'warnings'];

async function testValidRequest() {
  await withServer(async (base) => {
    const resp = await fetch(`${base}/plan-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: { lat: 50.0, lon: -3.0 },
        end: { lat: 50.15, lon: -2.5 },
        departureTime: '2026-07-16T12:00:00.000Z'
      })
    });
    const body = await resp.json();
    check('valid request returns 200', resp.status === 200, `got ${resp.status}`);
    check('response has all required PassageResult fields',
      REQUIRED_FIELDS.every(f => f in body), `missing: ${REQUIRED_FIELDS.filter(f => !(f in body)).join(', ')}`);
  });
}

async function testMissingStart() {
  await withServer(async (base) => {
    const resp = await fetch(`${base}/plan-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ end: { lat: 50.15, lon: -2.5 }, departureTime: '2026-07-16T12:00:00.000Z' })
    });
    const body = await resp.json();
    check('missing start returns 400', resp.status === 400, `got ${resp.status}`);
    check('missing start error names the field', typeof body.error === 'string' && body.error.includes('start'), body.error);
  });
}

async function testInvalidComfortParam() {
  await withServer(async (base) => {
    const resp = await fetch(`${base}/plan-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: { lat: 50.0, lon: -3.0 },
        end: { lat: 50.15, lon: -2.5 },
        departureTime: '2026-07-16T12:00:00.000Z',
        comfort: { engineOnWindKn: 10, engineOffWindKn: 6 }
      })
    });
    const body = await resp.json();
    check('invalid comfort param returns 400', resp.status === 400, `got ${resp.status}`);
    check('invalid comfort param error names the field',
      typeof body.error === 'string' && body.error.includes('engineOnWindKn'), body.error);
  });
}

async function testDebugStripped() {
  await withServer(async (base) => {
    const resp = await fetch(`${base}/plan-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: { lat: 50.0, lon: -3.0 },
        end: { lat: 50.15, lon: -2.5 },
        departureTime: '2026-07-16T12:00:00.000Z',
        debug: false
      })
    });
    const body = await resp.json();
    check('debug:false strips debug field', !('debug' in body), `debug present: ${'debug' in body}`);
  });
}

async function testDebugIncluded() {
  await withServer(async (base) => {
    const resp = await fetch(`${base}/plan-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: { lat: 50.0, lon: -3.0 },
        end: { lat: 50.15, lon: -2.5 },
        departureTime: '2026-07-16T12:00:00.000Z',
        debug: true
      })
    });
    const body = await resp.json();
    check('debug:true includes debug field', 'debug' in body && typeof body.debug.log === 'string');
  });
}

async function testRoughRouteRequest() {
  await withServer(async (base) => {
    const resp = await fetch(`${base}/plan-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roughRoute: [
          { lat: 50.0, lon: -3.0 },
          { lat: 50.08, lon: -2.75 },
          { lat: 50.15, lon: -2.5 }
        ],
        departureTime: '2026-07-16T12:00:00.000Z',
        debug: true
      })
    });
    const body = await resp.json();
    check('roughRoute request returns 200', resp.status === 200, `got ${resp.status}`);
    check('roughRoute is taken as the provided spine',
      body.debug && body.debug.roughRoute && body.debug.roughRoute.provided === true,
      `provided=${body.debug?.roughRoute?.provided}`);
  });
}

async function testRoughRouteTooShort() {
  await withServer(async (base) => {
    const resp = await fetch(`${base}/plan-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roughRoute: [{ lat: 50.0, lon: -3.0 }], departureTime: '2026-07-16T12:00:00.000Z' })
    });
    const body = await resp.json();
    check('single-point roughRoute returns 400', resp.status === 400, `got ${resp.status}`);
    check('roughRoute error names the field', typeof body.error === 'string' && body.error.includes('roughRoute'), body.error);
  });
}

async function testHealth() {
  await withServer(async (base) => {
    const resp = await fetch(`${base}/health`);
    const body = await resp.json();
    check('health check returns 200 ok', resp.status === 200 && body.status === 'ok');
  });
}

await testHealth();
await testValidRequest();
await testMissingStart();
await testInvalidComfortParam();
await testDebugStripped();
await testDebugIncluded();
await testRoughRouteRequest();
await testRoughRouteTooShort();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
