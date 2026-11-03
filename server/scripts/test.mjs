import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import EmbeddedPostgres from 'embedded-postgres';

// Manage PostgreSQL outside node:test: embedded-postgres installs a process exit
// hook that can interrupt the test worker's final IPC result when used inside it.
const directory = await mkdtemp(join(tmpdir(), 'shiri-postgres-'));
const probe = createServer();
await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
const { port } = probe.address();
await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
const password = randomBytes(24).toString('hex'); const database = `shiri_test_${randomUUID().replaceAll('-', '')}`;
const logs = [];
const postgres = new EmbeddedPostgres({ databaseDir: join(directory, 'data'), port, user: 'postgres', password,
  persistent: false, autoRehydrateSymlinks: true, initdbFlags: ['--locale=C', '--encoding=UTF8'],
  postgresFlags: ['-h', '127.0.0.1', '-k', directory], onLog: message => logs.push(message), onError: error => logs.push(String(error)) });
let started = false;
try {
  await postgres.initialise(); await postgres.start(); started = true;
  await postgres.createDatabase(database);
  const files = (await readdir('tests')).filter(name => name.endsWith('.test.ts')).map(name => join('tests', name));
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--test', ...files], { stdio: 'inherit', env: { ...process.env,
      SHIRI_TEST_DATABASE_URL: `postgres://postgres:${password}@127.0.0.1:${port}/${database}`,
      SHIRI_TEST_TEMP_DIR: directory
    } });
    child.once('error', reject); child.once('exit', code => resolve(code ?? 1));
  });
  process.exitCode = code;
} catch (error) {
  console.error(error, logs.slice(-15).join('\n')); process.exitCode = 1;
} finally {
  if (started) await postgres.stop();
  await rm(directory, { recursive: true, force: true });
}
