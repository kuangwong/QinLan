import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const load = name => import(pathToFileURL(join(process.env.SHIRI_DOMAIN_DIR, `${name}.js`)).href);
const { seed } = await load('Seed');
const { Rules } = await load('Rules');
const { decode, copy } = await load('Codec');
const { LocalStore } = await load('LocalStore');
const { cleanWords, dateKey, calendarDays, validDue, localDue, validDateKey } = await load('Models');
const now = new Date(2026, 10, 3, 15, 30);
const fresh = () => seed(now);

class MemoryStorage {
  constructor(raw) { this.raw = raw; this.fail = false; this.writes = 0; }
  async read() { return this.raw; }
  async write(value) {
    if (this.fail) throw new Error('disk full');
    this.raw = value; this.writes++;
  }
}

test('seed round-trips with independent copies', () => {
  const state = fresh();
  const restored = decode(JSON.stringify(state));
  assert.equal(restored.records[0].date, '2026-11-03');
  const other = copy(state); other.tasks[0].title = '独立副本';
  assert.notEqual(state.tasks[0].title, other.tasks[0].title);
});

test('my tasks include personal unassigned tasks and my shared assignments only', () => {
  const tasks = Rules.tasks(fresh(), 'mine', 'pending');
  assert.deepEqual(tasks.map(task => task.id), ['t1', 't2', 't3']);
  assert.deepEqual(Rules.tasks(fresh(), 'weekend', 'all').map(task => task.id), ['t2', 't4']);
  assert.equal(Rules.tasks(fresh(), 'chen-personal', 'all').length, 0);
});

test('search matches title and notes; assignment filters include unassigned', () => {
  assert.equal(Rules.tasks(fresh(), 'mine', 'all', '热茶')[0].id, 't3');
  assert.deepEqual(Rules.tasks(fresh(), 'weekend', 'all', '', 'chen').map(task => task.id), ['t4']);
  assert.deepEqual(Rules.tasks(fresh(), 'mine', 'all', '', '').map(task => task.id), ['t3']);
});

test('create, edit, complete, restore and delete a versioned task', () => {
  const state = fresh();
  Rules.saveTask(state, 'new', 'personal', ' 散步 ', ' 公园 ', 'lin', '', now.getTime());
  const task = state.tasks.find(task => task.id === 'new');
  assert.equal(task.title, '散步'); assert.equal(task.note, '公园');
  Rules.saveTask(state, 'new', 'personal', '散步二十分钟', '', '', '2026-11-04T18:00', now.getTime(), 1);
  Rules.toggleTask(state, 'new', 2); assert.equal(task.done, true);
  Rules.toggleTask(state, 'new', 3); assert.equal(task.done, false);
  Rules.deleteTask(state, 'new', 4);
  assert.ok(!state.tasks.some(task => task.id === 'new'));
});

test('reject blank titles, invalid dates, nonmembers and stale task edits', () => {
  const state = fresh();
  assert.throws(() => Rules.saveTask(state, 'new', 'personal', ' ', '', '', '', 0), /标题/);
  assert.throws(() => Rules.saveTask(state, 'new', 'personal', '标题', '', 'chen', '', 0), /负责人/);
  assert.throws(() => Rules.saveTask(state, 'new', 'personal', '标题', '', '', '2026-02-30T10:00', 0), /截止/);
  assert.throws(() => Rules.saveTask(state, 't1', 'personal', '改写', '', '', '', 0, 8), /发生变化/);
  state.user = 'chen';
  assert.throws(() => Rules.toggleTask(state, 't1', 1), /清单/);
  assert.throws(() => Rules.deleteTask(state, 't1', 1), /清单/);
});

test('stale deleted task is not silently recreated and moves are rejected', () => {
  const state = fresh();
  Rules.deleteTask(state, 't1', 1);
  assert.throws(() => Rules.saveTask(state, 't1', 'personal', '旧内容', '', '', '', 0, 1), /已被删除/);
  assert.throws(() => Rules.saveTask(state, 't2', 'personal', '跨清单', '', '', '', 0, 1), /跨清单/);
});

test('completion sorts after open tasks; undated tasks sort last within status', () => {
  const state = fresh(); Rules.toggleTask(state, 't1', 1);
  assert.deepEqual(Rules.tasks(state, 'mine', 'all').map(task => task.id), ['t2', 't3', 't1']);
});

test('invite lookup requires confirmation; expiry and revocation invalidate joining', () => {
  const state = fresh();
  Rules.createList(state, 'new-list', ' 新清单 ');
  Rules.invite(state, 'new-list', 'SHIRI-ABC', 100);
  state.user = 'chen';
  assert.equal(Rules.findInvitation(state, ' shiri-abc ', 101).name, '新清单');
  assert.deepEqual(state.lists.find(list => list.id === 'new-list').members, ['lin']);
  Rules.join(state, 'shiri-abc', 101);
  assert.throws(() => Rules.join(state, 'SHIRI-ABC', 101), /已经/);
  state.user = 'xu';
  assert.throws(() => Rules.join(state, 'SHIRI-ABC', 100 + 7 * 86400000), /过期/);
  state.user = 'lin'; Rules.revokeInvite(state, 'new-list'); state.user = 'xu';
  assert.throws(() => Rules.join(state, 'SHIRI-ABC', 102), /撤销/);
});

test('ordinary members cannot manage invitations, transfer or delete lists', () => {
  const state = fresh(); state.user = 'chen';
  assert.throws(() => Rules.invite(state, 'weekend', 'SHIRI-A', 0), /所有者/);
  assert.throws(() => Rules.revokeInvite(state, 'weekend'), /所有者/);
  assert.throws(() => Rules.transfer(state, 'weekend', 'xu'), /所有者/);
  assert.throws(() => Rules.deleteList(state, 'weekend'), /所有者/);
  assert.throws(() => Rules.removeMember(state, 'weekend', 'xu'), /所有者/);
});

test('member removal unassigns only open tasks and preserves completed history', () => {
  const state = fresh();
  Rules.saveTask(state, 'completed', 'weekend', '已完成', '', 'chen', '', 0);
  Rules.toggleTask(state, 'completed', 1);
  Rules.removeMember(state, 'weekend', 'chen');
  assert.equal(state.tasks.find(task => task.id === 't4').assignee, '');
  assert.equal(state.tasks.find(task => task.id === 't4').version, 2);
  assert.equal(state.tasks.find(task => task.id === 'completed').assignee, 'chen');
  assert.doesNotThrow(() => copy(state));
  Rules.toggleTask(state, 'completed', 2);
  assert.equal(state.tasks.find(task => task.id === 'completed').assignee, '');
  assert.doesNotThrow(() => copy(state));
});

test('owner cannot leave; transfer revokes invites then former owner can exit', () => {
  const state = fresh();
  assert.throws(() => Rules.removeMember(state, 'weekend', 'lin'), /转让/);
  Rules.invite(state, 'weekend', 'SHIRI-A', 100);
  Rules.transfer(state, 'weekend', 'chen');
  assert.equal(state.lists.find(list => list.id === 'weekend').invite, '');
  Rules.removeMember(state, 'weekend', 'lin');
  assert.equal(state.tasks.find(task => task.id === 't2').assignee, '');
  assert.throws(() => Rules.member(state, 'weekend'), /清单/);
});

test('list deletion removes tasks and shares while retaining original names', () => {
  const state = fresh();
  Rules.deleteList(state, 'weekend');
  assert.ok(!state.tasks.some(task => task.listId === 'weekend'));
  assert.equal(state.records.length, 2);
  assert.deepEqual(state.records.find(record => record.id === 'n2').sharedTo, []);
});

test('word imports remove UTF-8 BOM, blanks, CRLF, whitespace and duplicates', () => {
  assert.deepEqual(cleanWords('\uFEFF 月亮 \r\n\r\n月亮\n 海风  \n'), ['月亮', '海风']);
});

test('two or three ordered slots generate without saving or changing tasks', () => {
  const state = fresh(); const original = JSON.stringify(state);
  assert.equal(Rules.generate(state, 'forest', () => 0).name, '慢慢的小水獭');
  assert.equal(JSON.stringify(state), original);
  Rules.saveLibrary(state, 'three', ' 三组 ', 'combine', [' 温柔的\n温柔的', '森林', '旅人']);
  const result = Rules.generate(state, 'three', () => 0);
  assert.equal(result.name, '温柔的森林旅人');
  assert.equal(state.records.length, 2); assert.equal(state.tasks.length, 5);
});

test('complete-name generation draws a full entry', () => {
  assert.equal(Rules.generate(fresh(), 'universe', () => 0.999).name, '橘子汽水');
});

test('three valid maximum-length slot entries generate a name that can be saved', () => {
  const state = fresh();
  const words = ['甲'.repeat(300), '乙'.repeat(300), '丙'.repeat(300)];
  Rules.saveLibrary(state, 'long', '长名称组合', 'combine', words);
  const generated = Rules.generate(state, 'long', () => 0);
  assert.equal(generated.name, words.join(''));
  Rules.saveName(state, 'long-record', generated, now);
  assert.equal(state.records[0].name.length, 900);
});

test('reject empty libraries, wrong slot counts and other users libraries', () => {
  const state = fresh();
  assert.throws(() => Rules.saveLibrary(state, 'bad', '空库', 'full', [' \n ']), /非空/);
  assert.throws(() => Rules.saveLibrary(state, 'bad', '组合', 'combine', ['单组']), /2–3/);
  assert.throws(() => Rules.saveLibrary(state, 'sea', '越权', 'full', ['词']), /自己/);
  assert.throws(() => Rules.deleteLibrary(state, 'sea'), /自己/);
  assert.throws(() => Rules.generate(state, 'sea'), /自己/);
  assert.throws(() => Rules.generate(state, 'forest', () => 1), /随机/);
});

test('saved names retain source snapshots after library edits and deletion', () => {
  const state = fresh(); const taskCount = state.tasks.length;
  const generated = Rules.generate(state, 'forest', () => 0);
  Rules.saveName(state, 'saved', generated, now);
  Rules.saveLibrary(state, 'forest', '新库名', 'full', ['新名字']);
  Rules.deleteLibrary(state, 'forest');
  const record = state.records.find(record => record.id === 'saved');
  assert.equal(record.source, '森林来信'); assert.equal(record.name, '慢慢的小水獭');
  assert.equal(record.date, dateKey(now)); assert.equal(record.savedAt, now.toISOString());
  assert.equal(state.tasks.length, taskCount);
});

test('same names can be saved multiple times without restricting a date to one record', () => {
  const state = fresh(); const generated = Rules.generate(state, 'forest', () => 0);
  Rules.saveName(state, 'a', generated, now); Rules.saveName(state, 'b', generated, now);
  assert.equal(state.records.filter(record => record.date === dateKey(now) && record.owner === 'lin').length, 3);
  assert.throws(() => Rules.saveName(state, 'a', generated, now), /已保存/);
});

test('personal names are private; explicit shares appear only in shared list scope', () => {
  const state = fresh(); Rules.share(state, 'n1', ['weekend', 'weekend']);
  assert.deepEqual(state.records.find(record => record.id === 'n1').sharedTo, ['weekend']);
  state.user = 'chen';
  assert.ok(!Rules.records(state, 'mine').some(record => record.id === 'n1'));
  assert.ok(Rules.records(state, 'weekend').some(record => record.id === 'n1'));
  assert.throws(() => Rules.deleteRecord(state, 'n1'), /自己/);
  assert.throws(() => Rules.share(state, 'n1', []), /自己/);
  Rules.removeMember(state, 'weekend', 'chen');
  assert.throws(() => Rules.records(state, 'weekend'), /清单/);
});

test('sharing can be revoked and cannot target personal lists', () => {
  const state = fresh();
  assert.throws(() => Rules.share(state, 'n1', ['personal']), /共享清单/);
  Rules.share(state, 'n1', ['weekend']); Rules.share(state, 'n1', []);
  state.user = 'chen';
  assert.ok(!Rules.records(state, 'weekend').some(record => record.id === 'n1'));
});

test('calendar has 42 unique Monday-first cells including leap day and year boundaries', () => {
  const september = calendarDays(2026, 8); // September 1 is Tuesday.
  assert.equal(september.length, 42); assert.equal(september[0].key, '2026-08-31');
  assert.equal(new Set(september.map(day => day.key)).size, 42);
  assert.equal(calendarDays(2024, 1).filter(day => day.inMonth).length, 29);
  assert.equal(calendarDays(2027, 0)[0].key, '2026-12-28');
  assert.equal(calendarDays(2026, 10)[0].key, '2026-10-26'); // Sunday start.
});

test('due dates reject impossible days, times and ambiguous input', () => {
  for (const value of ['2026-02-29T10:00', '2026-04-31T10:00', '2026-11-03T24:00', '2026-11-03T12:60', 'tomorrow', '2026-1-1T1:00']) {
    assert.equal(validDue(value), false, value);
  }
  assert.equal(validDue('2024-02-29T10:00'), true); assert.equal(validDue(''), true);
});

test('deadlines retain their instant and archived name dates stay fixed across time zones', () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Shanghai';
    const state = seed(new Date('2026-11-03T15:30:00.000Z'));
    Rules.saveTask(state, 'timezone', 'personal', '跨时区待办', '', 'lin', '2026-11-03T23:30', 0);
    const task = state.tasks.find(task => task.id === 'timezone');
    assert.equal(task.due, '2026-11-03T15:30:00.000Z');
    const stored = JSON.stringify(state);
    process.env.TZ = 'America/Los_Angeles';
    const restored = decode(stored);
    assert.equal(restored.records[0].date, '2026-11-03');
    assert.equal(localDue(task.due), '2026-11-03 07:30');
    assert.equal(restored.tasks.find(task => task.id === 'timezone').due, task.due);
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test('archived date validation is independent of device timezone and rejects impossible dates', () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = 'Pacific/Apia';
    assert.equal(validDateKey('2011-12-30'), true); // This local day was skipped in Apia.
    assert.equal(validDateKey('2026-02-30'), false);
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test('bad schema, broken references and malformed nested content fail closed', () => {
  for (const raw of ['null', '{}', '[]', '{', JSON.stringify({ ...fresh(), schema: 2 })]) assert.throws(() => decode(raw));
  const invalid = fresh(); invalid.tasks[0].assignee = 'stranger';
  assert.throws(() => decode(JSON.stringify(invalid)), /损坏/);
  const wrong = fresh(); wrong.libraries[0].slots = [null];
  assert.throws(() => decode(JSON.stringify(wrong)));
});

test('first launch persists seed once and reopening retains mutations', async () => {
  const storage = new MemoryStorage(); const store = await LocalStore.open(storage);
  assert.equal(storage.writes, 1);
  await store.update(state => Rules.createList(state, 'persisted', '留下来'));
  const reopened = await LocalStore.open(storage);
  assert.ok(reopened.snapshot().lists.some(list => list.id === 'persisted'));
  assert.equal(storage.writes, 2);
});

test('changed library, membership and sharing snapshots invalidate cached cards after persistence', async () => {
  const storage = new MemoryStorage(JSON.stringify(fresh()));
  const store = await LocalStore.open(storage);
  const before = store.snapshot();
  const changed = await store.update(state => {
    Rules.saveLibrary(state, 'forest', '新的灵感', 'full', ['月下旅人']);
    Rules.removeMember(state, 'weekend', 'xu');
    Rules.share(state, 'n1', ['weekend']);
  });
  for (const [collection, id] of [['libraries', 'forest'], ['lists', 'weekend'], ['records', 'n1']]) {
    const previous = before[collection].find(item => item.id === id);
    const next = changed[collection].find(item => item.id === id);
    assert.ok(next.version > previous.version, `${collection} revision must invalidate its cached card`);
  }
  assert.equal(before.libraries[0].name, '森林来信');
  assert.equal(changed.libraries[0].name, '新的灵感');
  assert.equal(changed.records.find(record => record.id === 'n1').source, '森林来信');
  const reopened = await LocalStore.open(storage);
  assert.deepEqual(reopened.snapshot(), changed);
  const unchanged = changed.records.find(record => record.id === 'n2');
  assert.equal(unchanged.version, before.records.find(record => record.id === 'n2').version);
});

test('storage failures preserve last successful state and permit retry', async () => {
  const storage = new MemoryStorage(JSON.stringify(fresh())); const store = await LocalStore.open(storage);
  storage.fail = true;
  await assert.rejects(store.update(state => Rules.deleteTask(state, 't1', 1)), /disk full/);
  assert.ok(store.snapshot().tasks.some(task => task.id === 't1'));
  assert.ok(JSON.parse(storage.raw).tasks.some(task => task.id === 't1'));
  storage.fail = false;
  await store.update(state => Rules.deleteTask(state, 't1', 1));
  assert.ok(!store.snapshot().tasks.some(task => task.id === 't1'));
});

test('invalid changes cannot leak through to memory or disk', async () => {
  const storage = new MemoryStorage(JSON.stringify(fresh())); const store = await LocalStore.open(storage);
  const before = storage.raw;
  await assert.rejects(store.update(state => { state.tasks[0].title = '脏写'; throw new Error('cancel'); }));
  assert.equal(storage.raw, before); assert.notEqual(store.snapshot().tasks[0].title, '脏写');
  await assert.rejects(store.update(state => state.tasks[0].assignee = 'unknown'));
  const snapshot = store.snapshot(); snapshot.tasks[0].title = '外部修改';
  assert.notEqual(store.snapshot().tasks[0].title, '外部修改');
});

test('simultaneous writes are rejected rather than silently losing updates', async () => {
  const storage = new MemoryStorage(JSON.stringify(fresh())); let release;
  storage.write = value => new Promise(resolve => { release = () => { storage.raw = value; resolve(); }; });
  const store = await LocalStore.open(storage);
  const first = store.update(state => Rules.createList(state, 'one', '第一份'));
  await assert.rejects(store.update(state => Rules.createList(state, 'two', '第二份')), /正在保存/);
  release(); await first;
  assert.ok(store.snapshot().lists.some(list => list.id === 'one'));
  assert.ok(!store.snapshot().lists.some(list => list.id === 'two'));
});

test('corrupt storage is retained; it is never overwritten with demo data', async () => {
  const storage = new MemoryStorage('{broken');
  await assert.rejects(LocalStore.open(storage));
  assert.equal(storage.raw, '{broken'); assert.equal(storage.writes, 0);
});
