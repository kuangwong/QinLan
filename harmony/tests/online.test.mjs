import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const load = name => import(pathToFileURL(join(process.env.SHIRI_DOMAIN_DIR, `${name}.js`)).href);
const { DEFAULT_SERVER, OnlineClient, serverAddress } = await load('OnlineClient');
const { seed } = await load('Seed');
const token = 'a'.repeat(64);
const session = () => ({ token, userId: 'lin', expiresAt: new Date(Date.now() + 86400000).toISOString() });

class Vault {
  value; failWrite = false;
  async read() { return this.value; }
  async write(value) { if (this.failWrite) throw new Error('secure storage locked'); this.value = structuredClone(value); }
  async clear() { this.value = undefined; }
}
class Transport {
  calls = []; state = seed(); failMutation = false; failLogout = false;
  async request(baseUrl, method, path, bearer, body) {
    this.calls.push({ baseUrl, method, path, bearer, body });
    if (path === '/api/v1/auth/login' || path === '/api/v1/auth/register') return JSON.stringify(session());
    if (path === '/api/v1/auth/logout') { if (this.failLogout) throw new Error('offline'); return '{}'; }
    if (path === '/api/v1/state') return JSON.stringify(this.state);
    if (this.failMutation) throw new Error('offline');
    return '{}';
  }
}
async function fixture() {
  const vault = new Vault(); const transport = new Transport();
  const client = await OnlineClient.authenticate(transport, vault, 'http://127.0.0.1:3000/', 'xiaoman', 'test-password');
  return { vault, transport, client };
}

test('authentication targets the built-in Tencent Cloud service without asking for an address', async () => {
  assert.equal(DEFAULT_SERVER, 'http://82.157.149.117:8080');
  assert.equal(serverAddress(DEFAULT_SERVER), DEFAULT_SERVER);
  const transport = new Transport(); const vault = new Vault();
  await OnlineClient.authenticate(transport, vault, DEFAULT_SERVER, 'xiaoman', 'test-password');
  assert.equal(transport.calls[0].baseUrl, DEFAULT_SERVER);
});

test('login saves only a session in the vault; later requests use the session bearer', async () => {
  const { vault, transport, client } = await fixture();
  assert.equal(vault.value.baseUrl, 'http://127.0.0.1:3000'); assert.equal(vault.value.token, token);
  assert.ok(!JSON.stringify(vault.value).includes('test-password'));
  const state = await client.state();
  assert.equal(state.user, 'lin'); assert.equal(transport.calls.at(-1).bearer, token);
  assert.ok(!JSON.stringify(state).includes(token));
});

test('device secure-storage failure revokes the new session without plaintext fallback', async () => {
  const transport = new Transport(); const vault = new Vault(); vault.failWrite = true;
  await assert.rejects(OnlineClient.authenticate(transport, vault, 'https://shiri.example.com', 'xiaoman', 'test-password'), /安全保存/);
  assert.equal(vault.value, undefined);
  assert.equal(transport.calls.at(-1).path, '/api/v1/auth/logout');
  assert.equal(transport.calls.at(-1).body, '{}');
});

test('resuming an upgraded install reuses the fixed cloud address', async () => {
  const { vault, transport } = await fixture();
  const restored = await OnlineClient.resume(transport, vault, DEFAULT_SERVER);
  assert.ok(restored);
  assert.equal(restored.address(), DEFAULT_SERVER);
  await restored.state();
  assert.equal(transport.calls.at(-1).baseUrl, DEFAULT_SERVER);
});

test('resume uses the vault and expires old sessions without network calls', async () => {
  const { vault, transport } = await fixture();
  const restored = await OnlineClient.resume(transport, vault); assert.ok(restored);
  vault.value.expiresAt = new Date(Date.now() - 1000).toISOString();
  const before = transport.calls.length;
  assert.equal(await OnlineClient.resume(transport, vault), undefined);
  assert.equal(vault.value, undefined); assert.equal(transport.calls.length, before);
});

test('logout clears local credentials even when server revocation cannot be reached', async () => {
  const { client, vault, transport } = await fixture(); transport.failLogout = true;
  await assert.rejects(client.logout(), /offline/);
  assert.equal(vault.value, undefined);
});

test('failed mutations preserve caller drafts and do not mutate the displayed state', async () => {
  const { client, transport } = await fixture(); transport.failMutation = true;
  const snapshot = await client.state(); const before = JSON.stringify(snapshot);
  const task = snapshot.tasks[0]; const draft = { title: '我的未保存输入', note: '失败后保留' };
  await assert.rejects(client.saveTask(task, task.listId, draft.title, draft.note, task.assignee, '', task.version), /offline/);
  assert.equal(JSON.stringify(snapshot), before); assert.equal(draft.title, '我的未保存输入');
  assert.equal(JSON.parse(transport.calls.at(-1).body).version, task.version);
});

test('stale edit versions survive refresh; deleted items cannot be recreated implicitly', async () => {
  const { client, transport } = await fixture(); const task = (await client.state()).tasks[0]; task.version = 9;
  await client.saveTask(task, task.listId, '旧表单', '', '', '', 2);
  assert.equal(JSON.parse(transport.calls.at(-1).body).version, 2);
  await assert.rejects(client.saveTask(undefined, task.listId, '删除的待办', '', '', '', 2), /删除/);
  await assert.rejects(client.saveLibrary(undefined, '删除的词库', 'full', ['词'], 2), /删除/);
});

test('creation requests preserve a stable client id so an uncertain retry cannot duplicate a record', async () => {
  const { client, transport } = await fixture(); const id = '8dfc4937-b903-49ad-91a6-ef40cfc6207a';
  await client.saveName({ name: '慢慢的小水獭', mode: 'combine', source: '森林来信' }, id);
  const first = JSON.parse(transport.calls.at(-1).body);
  await client.saveName({ name: '慢慢的小水獭', mode: 'combine', source: '森林来信' }, id);
  assert.equal(JSON.parse(transport.calls.at(-1).body).id, first.id);
  await client.saveTask(undefined, 'list', '新建', '', '', '', 0, id);
  assert.equal(JSON.parse(transport.calls.at(-1).body).id, id);
});

test('client rejects mismatched account snapshots and malformed service addresses', async () => {
  const { client, transport } = await fixture(); transport.state.user = 'chen';
  await assert.rejects(client.state(), /不匹配/);
  assert.equal(serverAddress(' https://shiri.example.com/ '), 'https://shiri.example.com');
  for (const value of ['javascript:alert(1)', 'https://user:secret@example.com', 'https://example.com/path', 'file:///tmp/data']) {
    assert.throws(() => serverAddress(value), /服务地址/);
  }
});

test('invalid word imports fail before sending and retain the existing draft and snapshot', async () => {
  const { client, transport } = await fixture();
  const before = await client.state();
  const invalid = ['字'.repeat(101), Array.from({ length: 2001 }, (_, index) => `候选${index}`).join('\n')];
  const calls = transport.calls.length;
  for (const text of invalid) {
    await assert.rejects(client.saveLibrary(undefined, '灵感', 'full', [text], 0), /词组 1/);
    assert.equal(transport.calls.length, calls);
    assert.equal(JSON.stringify(transport.state), JSON.stringify(before));
  }
  await client.saveLibrary(undefined, '有效导入', 'full', ['\uFEFF月亮\r\n\r\n月亮\n海风'], 0);
  assert.deepEqual(JSON.parse(transport.calls.at(-1).body).slots, [['月亮', '海风']]);
});
