import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import type { FastifyInstance, HTTPMethods } from 'fastify';
import { buildApp, serializeRequest } from '../src/app.js';
import { assertMigrated, migrate } from '../src/db.js';
import type { Snapshot } from '../src/state.js';
import { nativeClient } from './native-client.js';

test('Fastify API with an isolated real PostgreSQL cluster', { timeout: 120000 }, async t => {
  assert.ok(process.env.SHIRI_TEST_DATABASE_URL && process.env.SHIRI_TEST_TEMP_DIR, 'Run pnpm test to create an isolated test cluster');
  const address = new URL(process.env.SHIRI_TEST_DATABASE_URL);
  assert.equal(address.hostname, '127.0.0.1'); assert.match(address.pathname, /^\/shiri_test_[a-f0-9]{32}$/);
  const directory = process.env.SHIRI_TEST_TEMP_DIR;
  const pool = new Pool({ connectionString: address.href, max: 10 }); let app: FastifyInstance | undefined;
  t.after(async () => { await app?.close(); await pool.end(); });
  await migrate(pool); await migrate(pool);
  app = await buildApp({ pool, rateLimit: false });

  async function request(method: HTTPMethods, url: string, token?: string, payload?: object, status = 200) {
    const response = await app!.inject({ method, url, headers: token ? { authorization: `Bearer ${token}` } : {}, payload });
    assert.equal(response.statusCode, status, `${method} ${url}: ${response.body}`);
    return response.json();
  }
  async function register(username: string) {
    const account = await request('POST', '/api/v1/auth/register', undefined, { username, password: 'test-password-123', name: username }, 201);
    return { token: account.token as string, id: account.userId as string };
  }
  async function fixture() {
    await pool!.query('TRUNCATE users CASCADE');
    const a = await register('xiaoman'); const b = await register('yizhou'); const outsider = await register('outsider');
    return { a, b, outsider };
  }
  async function state(token: string): Promise<Snapshot> { return request('GET', '/api/v1/state', token); }
  async function shared(a: { token: string }, b: { token: string }) {
    const list = await request('POST', '/api/v1/lists', a.token, { name: '一起散步' }, 201);
    const invitation = await request('POST', `/api/v1/lists/${list.id}/invitation`, a.token, { version: 1 });
    await request('POST', '/api/v1/invitations/join', b.token, { code: invitation.code });
    return { id: list.id as string, code: invitation.code as string, version: 3 };
  }

  await t.test('migrations are idempotent and execute on PostgreSQL', async () => {
    const result = await pool!.query('SELECT version()');
    assert.match(result.rows[0].version, /^PostgreSQL 18/);
    assert.equal((await pool!.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count, 2);
  });
  await t.test('request logs strip query strings and invitation path secrets', () => {
    assert.deepEqual(serializeRequest({ method: 'GET', url: '/api/v1/tasks?q=私人搜索&month=2026-11' }),
      { method: 'GET', url: '/api/v1/tasks' });
    const invite = serializeRequest({ method: 'GET', url: '/api/v1/invitations/SHIRI-0123456789ABCDEF01234567' });
    assert.equal(invite.url, '/api/v1/invitations/[redacted]');
    assert.ok(!JSON.stringify(invite).includes('SHIRI'));
  });
  await t.test('documented migration and seed commands create two accounts and preserve existing data on rerun', async () => {
    const run = promisify(execFile);
    await pool!.query('TRUNCATE users CASCADE');
    const env = { ...process.env, DATABASE_URL: address.href, DEMO_PASSWORD: 'seed-test-password' };
    await run(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], { env });
    await run(process.execPath, ['--import', 'tsx', 'scripts/seed.ts'], { env });
    assert.equal((await pool!.query('SELECT count(*)::int AS count FROM users')).rows[0].count, 2);
    assert.equal((await pool!.query('SELECT count(*)::int AS count FROM sessions')).rows[0].count, 0);
    const before = (await pool!.query('SELECT username,password_hash FROM users ORDER BY username')).rows;
    await run(process.execPath, ['--import', 'tsx', 'scripts/seed.ts'], { env: { ...env, DEMO_PASSWORD: 'different-password' } });
    assert.deepEqual((await pool!.query('SELECT username,password_hash FROM users ORDER BY username')).rows, before);
  });
  await t.test('register/login/logout uses Argon2id and hashed, expiring sessions', async () => {
    const { a } = await fixture();
    const [{ password_hash: stored }] = (await pool!.query('SELECT password_hash FROM users WHERE id=$1', [a.id])).rows;
    assert.match(stored, /^\$argon2id\$/); assert.ok(!stored.includes('test-password'));
    const sessions = (await pool!.query('SELECT token_hash,expires_at FROM sessions WHERE user_id=$1', [a.id])).rows;
    assert.ok(!sessions.some(session => session.token_hash === a.token));
    const login = await request('POST', '/api/v1/auth/login', undefined, { username: 'XIAOMAN', password: 'test-password-123' });
    assert.equal(login.userId, a.id);
    await request('POST', '/api/v1/auth/logout', login.token);
    await request('GET', '/api/v1/state', login.token, undefined, 401);
    await request('POST', '/api/v1/auth/login', undefined, { username: 'xiaoman', password: 'wrong-password' }, 401);
    await pool!.query('UPDATE sessions SET expires_at=now()-interval \'1 second\' WHERE user_id=$1', [a.id]);
    await request('GET', '/api/v1/me', a.token, undefined, 401);
  });
  await t.test('unauthenticated and malformed requests cannot read or change data', async () => {
    const { a } = await fixture();
    await request('GET', '/api/v1/state', undefined, undefined, 401);
    await request('POST', '/api/v1/lists', a.token, { name: '' }, 400);
    await request('POST', '/api/v1/lists', a.token, { name: '名字', owner: randomUUID() }, 400);
    await request('POST', '/api/v1/auth/register', undefined, { username: 'ab', name: '短', password: 'short' }, 400);
  });
  await t.test('private snapshots exclude other accounts, libraries, tasks and names', async () => {
    const { a, b } = await fixture();
    const own = await state(a.token); const other = await state(b.token);
    assert.deepEqual(own.people.map(person => person.id), [a.id]);
    assert.ok(own.libraries.every(library => library.owner === a.id));
    await request('POST', `/api/v1/lists/${other.lists[0].id}/tasks`, a.token, { title: '越权' }, 404);
    await request('PUT', `/api/v1/libraries/${other.libraries[0].id}`, a.token,
      { version: 1, data: { name: '越权', mode: 'full', slots: [['词']] } }, 404);
  });
  await t.test('invite lookup does not join; confirmation joins; stored codes are hashed', async () => {
    const { a, b } = await fixture();
    const list = await request('POST', '/api/v1/lists', a.token, { name: '邀请流程' }, 201);
    const invite = await request('POST', `/api/v1/lists/${list.id}/invitation`, a.token, { version: 1 });
    const before = await state(b.token);
    const preview = await request('POST', '/api/v1/invitations/lookup', b.token, { code: invite.code.toLowerCase() });
    assert.equal(preview.name, '邀请流程'); assert.equal(preview.alreadyJoined, false);
    assert.equal((await state(b.token)).lists.length, before.lists.length);
    const [{ invite_hash: stored }] = (await pool!.query('SELECT invite_hash FROM lists WHERE id=$1', [list.id])).rows;
    assert.notEqual(stored, invite.code);
    await request('POST', '/api/v1/invitations/join', b.token, { code: invite.code });
    assert.ok((await state(b.token)).lists.some(item => item.id === list.id));
    await request('POST', '/api/v1/invitations/join', b.token, { code: invite.code }, 409);
  });
  await t.test('revoked, rotated and expired invitations cannot be used', async () => {
    const { a, b } = await fixture(); const list = (await state(a.token)).lists[0];
    const first = await request('POST', `/api/v1/lists/${list.id}/invitation`, a.token, { version: 1 });
    const second = await request('POST', `/api/v1/lists/${list.id}/invitation`, a.token, { version: 2 });
    await request('POST', '/api/v1/invitations/join', b.token, { code: first.code }, 404);
    await request('DELETE', `/api/v1/lists/${list.id}/invitation`, a.token, { version: 3 });
    await request('POST', '/api/v1/invitations/lookup', b.token, { code: second.code }, 404);
    const third = await request('POST', `/api/v1/lists/${list.id}/invitation`, a.token, { version: 4 });
    await pool!.query('UPDATE lists SET invite_expires=now()-interval \'1 second\' WHERE id=$1', [list.id]);
    await request('POST', '/api/v1/invitations/join', b.token, { code: third.code }, 404);
  });
  await t.test('members cannot manage lists and outsiders cannot see shared data', async () => {
    const { a, b, outsider } = await fixture(); const list = await shared(a, b);
    await request('DELETE', `/api/v1/lists/${list.id}`, b.token, { version: 3 }, 403);
    await request('POST', `/api/v1/lists/${list.id}/invitation`, b.token, { version: 3 }, 403);
    await request('POST', `/api/v1/lists/${list.id}/transfer`, b.token, { version: 3, userId: a.id }, 403);
    await request('DELETE', `/api/v1/lists/${list.id}/members/${a.id}`, b.token, { version: 3 }, 403);
    await request('GET', `/api/v1/tasks?listId=${list.id}`, outsider.token, undefined, 404);
    assert.ok(!(await state(outsider.token)).lists.some(item => item.id === list.id));
  });
  await t.test('shared tasks support edit, completion, restoration, search and deletion', async () => {
    const { a, b } = await fixture(); const list = await shared(a, b);
    const task = await request('POST', `/api/v1/lists/${list.id}/tasks`, a.token,
      { title: ' 散步 ', note: '去公园', assignee: b.id, due: '2026-11-04T18:00:00+08:00' }, 201);
    let saved = (await state(b.token)).tasks.find(item => item.id === task.id)!;
    assert.equal(saved.title, '散步'); assert.equal(saved.due, '2026-11-04T10:00:00.000Z');
    await request('PATCH', `/api/v1/tasks/${task.id}`, b.token,
      { title: '散步二十分钟', note: saved.note, assignee: b.id, due: saved.due, done: true, version: 1 });
    assert.equal((await request('GET', `/api/v1/tasks?status=done&q=${encodeURIComponent('二十')}`, a.token)).length, 1);
    await request('PATCH', `/api/v1/tasks/${task.id}`, a.token,
      { title: '散步二十分钟', note: '', assignee: b.id, due: '', done: false, version: 2 });
    saved = (await state(b.token)).tasks.find(item => item.id === task.id)!;
    assert.equal(saved.done, false); assert.equal(saved.version, 3);
    await request('DELETE', `/api/v1/tasks/${task.id}`, b.token, { version: 3 });
    assert.ok(!(await state(a.token)).tasks.some(item => item.id === task.id));
  });
  await t.test('invalid dates, nonmember assignees and extra authority fields are rejected', async () => {
    const { a, outsider } = await fixture(); const list = (await state(a.token)).lists[0];
    await request('POST', `/api/v1/lists/${list.id}/tasks`, a.token, { title: '非法日期', due: '2026-02-30T10:00:00Z' }, 400);
    await request('POST', `/api/v1/lists/${list.id}/tasks`, a.token, { title: '非法成员', assignee: outsider.id }, 422);
    await request('POST', `/api/v1/lists/${list.id}/tasks`, a.token, { title: '注入所有者', owner: outsider.id }, 400);
  });
  await t.test('concurrent edits with the same version yield one success and one conflict', async () => {
    const { a, b } = await fixture(); const list = await shared(a, b);
    const task = await request('POST', `/api/v1/lists/${list.id}/tasks`, a.token, { title: '共同编辑' }, 201);
    const results = await Promise.all([a, b].map((user, index) => app!.inject({ method: 'PATCH', url: `/api/v1/tasks/${task.id}`,
      headers: { authorization: `Bearer ${user.token}` }, payload: { title: `修改 ${index}`, done: false, version: 1 } })));
    assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 409]);
    assert.equal((await state(a.token)).tasks.find(item => item.id === task.id)?.version, 2);
    await request('DELETE', `/api/v1/tasks/${task.id}`, a.token, { version: 1 }, 409);
  });
  await t.test('leaving unassigns open tasks and preserves completed task history', async () => {
    const { a, b } = await fixture(); const list = await shared(a, b);
    const open = await request('POST', `/api/v1/lists/${list.id}/tasks`, a.token, { title: '未完成', assignee: b.id }, 201);
    const done = await request('POST', `/api/v1/lists/${list.id}/tasks`, a.token, { title: '已完成', assignee: b.id }, 201);
    await request('PATCH', `/api/v1/tasks/${done.id}`, b.token, { title: '已完成', assignee: b.id, done: true, version: 1 });
    await request('DELETE', `/api/v1/lists/${list.id}/members/${b.id}`, b.token, { version: 3 });
    const saved = await state(a.token);
    assert.equal(saved.tasks.find(item => item.id === open.id)?.assignee, '');
    assert.equal(saved.tasks.find(item => item.id === open.id)?.version, 2);
    assert.equal(saved.tasks.find(item => item.id === done.id)?.assignee, b.id);
    await request('PATCH', `/api/v1/tasks/${done.id}`, a.token, { title: '恢复已完成', assignee: b.id, done: false, version: 2 });
    assert.equal((await state(a.token)).tasks.find(item => item.id === done.id)?.assignee, '');
    await request('PATCH', `/api/v1/tasks/${open.id}`, b.token, { title: '越权', done: false, version: 2 }, 404);
    assert.ok(!(await state(b.token)).tasks.some(item => item.listId === list.id));
  });
  await t.test('concurrent assignment and member removal cannot leave an invalid open assignee', async () => {
    const { a, b } = await fixture(); const list = await shared(a, b);
    const responses = await Promise.all([
      app!.inject({ method: 'POST', url: `/api/v1/lists/${list.id}/tasks`, headers: { authorization: `Bearer ${a.token}` }, payload: { title: '同时发生', assignee: b.id } }),
      app!.inject({ method: 'DELETE', url: `/api/v1/lists/${list.id}/members/${b.id}`, headers: { authorization: `Bearer ${a.token}` }, payload: { version: 3 } })
    ]);
    assert.ok([201, 422].includes(responses[0].statusCode), responses[0].body);
    assert.equal(responses[1].statusCode, 200, responses[1].body);
    assert.ok((await state(a.token)).tasks.filter(item => item.listId === list.id).every(item => item.assignee === ''));
  });
  await t.test('owners must transfer before leaving; transfer invalidates the old invitation', async () => {
    const { a, b, outsider } = await fixture(); const list = await shared(a, b);
    await request('DELETE', `/api/v1/lists/${list.id}/members/${a.id}`, a.token, { version: 3 }, 422);
    await request('POST', `/api/v1/lists/${list.id}/transfer`, a.token, { version: 3, userId: b.id });
    await request('POST', '/api/v1/invitations/join', outsider.token, { code: list.code }, 404);
    await request('DELETE', `/api/v1/lists/${list.id}/members/${a.id}`, a.token, { version: 4 });
    assert.equal((await state(b.token)).lists.find(item => item.id === list.id)?.owner, b.id);
  });
  await t.test('library validation, deduplication, privacy and optimistic versions work', async () => {
    const { a, b } = await fixture();
    const library = await request('POST', '/api/v1/libraries', a.token, { name: '三组', mode: 'combine', slots: [[' 温柔的 ', '温柔的'], ['森林'], ['旅人']] }, 201);
    assert.deepEqual((await state(a.token)).libraries.find(item => item.id === library.id)?.slots, [['温柔的'], ['森林'], ['旅人']]);
    await request('POST', '/api/v1/libraries', a.token, { name: '错误', mode: 'combine', slots: [['单组']] }, 400);
    await request('POST', '/api/v1/libraries', a.token,
      { name: '超量', mode: 'full', slots: [Array.from({ length: 2001 }, (_, index) => `候选${index}`)] }, 400);
    await request('POST', '/api/v1/libraries', a.token,
      { name: '超长', mode: 'full', slots: [['甲'.repeat(101)]] }, 400);
    await request('POST', '/api/v1/libraries', a.token,
      { name: '上限', mode: 'full', slots: [Array.from({ length: 2000 }, (_, index) => `${'甲'.repeat(96)}${index}`)] }, 201);
    await request('DELETE', `/api/v1/libraries/${library.id}`, b.token, { version: 1 }, 404);
    await request('PUT', `/api/v1/libraries/${library.id}`, a.token, { version: 1, data: { name: '重命名', mode: 'full', slots: [['名称']] } });
    await request('DELETE', `/api/v1/libraries/${library.id}`, a.token, { version: 1 }, 409);
    await request('DELETE', `/api/v1/libraries/${library.id}`, a.token, { version: 2 });
  });
  await t.test('names save independently; historical source/date survive library deletion', async () => {
    const { a } = await fixture(); const before = await state(a.token); const library = before.libraries[0];
    const first = await request('POST', '/api/v1/records', a.token, { name: '月亮邮差', mode: 'full', source: library.name, date: '2026-11-03' }, 201);
    await request('POST', '/api/v1/records', a.token, { name: '月亮邮差', mode: 'full', source: library.name, date: '2026-11-03' }, 201);
    await request('DELETE', `/api/v1/libraries/${library.id}`, a.token, { version: 1 });
    const saved = await state(a.token);
    assert.equal(saved.tasks.length, before.tasks.length); assert.equal(saved.records.length, 2);
    assert.equal(saved.records.find(item => item.id === first.id)?.source, library.name);
    assert.equal(saved.records.find(item => item.id === first.id)?.date, '2026-11-03');
    assert.ok(saved.records.every(item => item.savedAt.endsWith('Z')));
    assert.equal((await request('GET', '/api/v1/records?month=2026-10', a.token)).length, 0);
  });
  await t.test('upgrading an existing database preserves history, permits maximum slots and retains the 900-character legacy cap', async () => {
    const { a } = await fixture();
    const old = await request('POST', '/api/v1/records', a.token,
      { name: '已有历史', mode: 'full', source: '旧词库', date: '2026-11-03' }, 201);
    // Recreate the original name-length gate with real saved data, then upgrade.
    await pool!.query(`ALTER TABLE name_records DROP CONSTRAINT name_records_name_check;
      ALTER TABLE name_records ADD CONSTRAINT name_records_name_check CHECK (length(name) BETWEEN 1 AND 300);
      DELETE FROM schema_migrations WHERE name='002_combined_name_length.sql'`);
    await assert.rejects(assertMigrated(pool!), /002_combined_name_length.sql.*pnpm migrate/);
    await assert.rejects(promisify(execFile)(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
      env: { ...process.env, DATABASE_URL: address.href, HOST: '127.0.0.1', PORT: '0' }, timeout: 10000
    }), (error: Error & { code?: number; stdout?: string }) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout || '', /002_combined_name_length.sql.*pnpm migrate/);
      return true;
    });
    await migrate(pool!);
    await migrate(pool!);
    await assertMigrated(pool!);
    const slots = [['甲'.repeat(100)], ['乙'.repeat(100)], ['丙'.repeat(100)]];
    await request('POST', '/api/v1/libraries', a.token, { name: '长名称组合', mode: 'combine', slots }, 201);
    const name = slots.map(slot => slot[0]).join('');
    const record = await request('POST', '/api/v1/records', a.token,
      { name, mode: 'combine', source: '长名称组合', date: '2026-11-03' }, 201);
    const legacy = '丁'.repeat(900);
    const legacyRecord = await request('POST', '/api/v1/records', a.token,
      { name: legacy, mode: 'full', source: '旧版历史', date: '2026-11-03' }, 201);
    const saved = await state(a.token);
    assert.equal(saved.records.find(item => item.id === old.id)?.name, '已有历史');
    assert.equal(saved.records.find(item => item.id === record.id)?.name, name);
    assert.equal(saved.records.find(item => item.id === legacyRecord.id)?.name, legacy);
    await request('POST', '/api/v1/records', a.token,
      { name: `${legacy}超`, mode: 'full', source: '旧版历史', date: '2026-11-03' }, 400);
  });
  await t.test('sharing exposes only name/date, can be revoked and never grants edit permission', async () => {
    const { a, b, outsider } = await fixture(); const list = await shared(a, b);
    const record = await request('POST', '/api/v1/records', a.token, { name: '私人灵感', mode: 'combine', source: '不公开词库', date: '2026-11-03' }, 201);
    assert.equal((await state(b.token)).records.length, 0);
    await request('PATCH', `/api/v1/records/${record.id}/shares`, a.token, { listIds: [list.id], version: 1 });
    const sharedRecords = await request('GET', `/api/v1/records?scope=${list.id}&month=2026-11`, b.token);
    assert.equal(sharedRecords[0].name, '私人灵感'); assert.equal(sharedRecords[0].source, '');
    assert.equal((await request('GET', '/api/v1/records?scope=mine', b.token)).length, 0);
    assert.equal((await state(outsider.token)).records.length, 0);
    await request('DELETE', `/api/v1/records/${record.id}`, b.token, { version: 2 }, 404);
    await request('PATCH', `/api/v1/records/${record.id}/shares`, b.token, { listIds: [], version: 2 }, 404);
    await request('PATCH', `/api/v1/records/${record.id}/shares`, a.token, { listIds: [], version: 2 });
    assert.equal((await state(b.token)).records.length, 0);
  });
  await t.test('sharing to personal or unrelated lists fails without replacing prior shares', async () => {
    const { a, b, outsider } = await fixture(); const list = await shared(a, b);
    const record = await request('POST', '/api/v1/records', a.token, { name: '灵感', mode: 'full', source: '词库', date: '2026-11-03' }, 201);
    await request('PATCH', `/api/v1/records/${record.id}/shares`, a.token, { listIds: [list.id], version: 1 });
    const personal = (await state(a.token)).lists.find(item => item.members.length === 1)!;
    await request('PATCH', `/api/v1/records/${record.id}/shares`, a.token, { listIds: [personal.id], version: 2 }, 422);
    const unrelated = (await state(outsider.token)).lists[0];
    await request('PATCH', `/api/v1/records/${record.id}/shares`, a.token, { listIds: [unrelated.id], version: 2 }, 404);
    assert.deepEqual((await state(a.token)).records[0].sharedTo, [list.id]);
  });
  await t.test('deleting a list cascades tasks/shares and keeps the original saved name', async () => {
    const { a, b } = await fixture(); const list = await shared(a, b);
    await request('POST', `/api/v1/lists/${list.id}/tasks`, a.token, { title: '临时任务' }, 201);
    const record = await request('POST', '/api/v1/records', a.token, { name: '保留历史', mode: 'full', source: '词库', date: '2026-11-03' }, 201);
    await request('PATCH', `/api/v1/records/${record.id}/shares`, a.token, { listIds: [list.id], version: 1 });
    await request('DELETE', `/api/v1/lists/${list.id}`, a.token, { version: 3 });
    const saved = await state(a.token);
    assert.equal(saved.tasks.length, 0); assert.equal(saved.records.length, 1); assert.deepEqual(saved.records[0].sharedTo, []);
  });
  await t.test('data survives server recreation and a new login session', async () => {
    const { a } = await fixture(); await request('POST', '/api/v1/lists', a.token, { name: '重启后保留' }, 201);
    await app!.close(); app = await buildApp({ pool: pool!, rateLimit: false });
    const login = await request('POST', '/api/v1/auth/login', undefined, { username: 'xiaoman', password: 'test-password-123' });
    assert.ok((await state(login.token)).lists.some(list => list.name === '重启后保留'));
  });
  await t.test('stable creation ids prevent duplicates after an uncertain network response', async () => {
    const { a } = await fixture(); const id = randomUUID();
    const payload = { id, name: '一次保存', mode: 'full', source: '我的词库', date: '2026-11-03' };
    await request('POST', '/api/v1/records', a.token, payload, 201);
    await request('POST', '/api/v1/records', a.token, payload, 409);
    assert.equal((await state(a.token)).records.length, 1);
  });
  await t.test('production auth throttling and no-store headers apply to real responses', async () => {
    const limited = await buildApp({ pool });
    try {
      for (let i = 0; i < 8; i++) {
        const response = await limited.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: 'missing', password: 'wrong-password' } });
        assert.equal(response.statusCode, 401); assert.equal(response.headers['cache-control'], 'no-store');
      }
      const rejected = await limited.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: 'missing', password: 'wrong-password' } });
      assert.equal(rejected.statusCode, 429);
    } finally { await limited.close(); }
  });
  await t.test('actual native OnlineClient interoperates over HTTP with registration, sharing, conflicts and secure-session restoration', async () => {
    await pool!.query('TRUNCATE users CASCADE');
    const { OnlineClient, responseFailure, recoveryAction } = await nativeClient(directory);
    const address = await app!.listen({ host: '127.0.0.1', port: 0 });
    class Vault {
      stored: object | undefined;
      async read() { return this.stored ? JSON.parse(JSON.stringify(this.stored)) : undefined; }
      async write(value: object) { this.stored = JSON.parse(JSON.stringify(value)); }
      async clear() { this.stored = undefined; }
    }
    const transport = {
      async request(baseUrl: string, method: string, path: string, token: string, body: string) {
        const response = await fetch(`${baseUrl}${path}`, { method, headers: {
          'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {})
        }, ...(body ? { body } : {}) });
        const raw = await response.text();
        if (!response.ok) throw responseFailure(response.status, raw);
        return raw;
      }
    };
    const vaultA = new Vault(); const vaultB = new Vault();
    const a = await OnlineClient.authenticate(transport, vaultA, address, 'native_a', 'native-password-123', '原生成员甲');
    const b = await OnlineClient.authenticate(transport, vaultB, address, 'native_b', 'native-password-123', '原生成员乙');
    let own = await a.state(); assert.equal(own.libraries.length, 2);
    const list = own.lists[0]; const invite = await a.invite(list);
    assert.equal((await b.findInvitation(invite.code)).alreadyJoined, false);
    await b.join(invite.code);
    own = await a.state(); const other = await b.state();
    assert.ok(other.lists.some((item: { id: string }) => item.id === list.id));
    await a.saveTask(undefined, list.id, '原生待办', '接口验收', other.user, '2026-11-04T18:00', 0);
    own = await a.state(); const task = own.tasks[0];
    await b.toggleTask(task); assert.equal((await a.state()).tasks[0].done, true);
    const draft = { title: '过期修改', note: '网络失败也要保留的输入' };
    await assert.rejects(a.saveTask(task, list.id, draft.title, draft.note, '', '', task.version), (error: Error) => {
      assert.equal(recoveryAction(error), 'reload'); assert.match(error.message, /修改/); return true;
    });
    const latest = (await a.state()).tasks[0];
    assert.equal(latest.title, '原生待办'); assert.equal(draft.title, '过期修改');
    // A regular refresh must not silently rebase the old editor's version.
    await assert.rejects(a.saveTask(latest, list.id, draft.title, draft.note, '', '', task.version), (error: Error) => {
      assert.equal(recoveryAction(error), 'reload'); return true;
    });
    await a.saveTask(latest, list.id, '确认最新版本后编辑', draft.note, latest.assignee, '', latest.version);
    assert.equal((await a.state()).tasks[0].title, '确认最新版本后编辑');
    await a.saveLibrary(undefined, '原生词库', 'combine', ['\uFEFF温柔的\n温柔的\n', '小狐狸'], 0);
    own = await a.state(); const library = own.libraries.find((item: { name: string }) => item.name === '原生词库');
    assert.deepEqual(library.slots, [['温柔的'], ['小狐狸']]);
    await a.saveName({ name: '温柔的小狐狸', mode: 'combine', source: '原生词库' });
    own = await a.state(); const record = own.records[0];
    await a.share(record, [list.id], record.version);
    assert.equal((await b.state()).records[0].source, '');
    await a.deleteLibrary(library); assert.equal((await a.state()).records[0].source, '原生词库');
    const restored = await OnlineClient.resume(transport, vaultA);
    assert.equal((await restored.state()).user, own.user);
    await restored.logout(); assert.equal(vaultA.stored, undefined);
    await assert.rejects(a.state(), (error: Error) => {
      assert.equal(recoveryAction(error), 'login'); assert.match(error.message, /登录/); return true;
    });
    await b.logout();
  });
});
