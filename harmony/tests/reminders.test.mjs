import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const load = name => import(pathToFileURL(join(process.env.SHIRI_DOMAIN_DIR, `${name}.js`)).href);
const { seed } = await load('Seed');
const { Rules } = await load('Rules');
const { DesiredReminder, ScheduledReminder, ReminderCoordinator, desiredReminders, reconcileReminders } = await load('Reminders');
const { AppState, Task } = await load('Models');
const morning = new Date(2026, 10, 3, 8, 0);

class FakeSystem {
  constructor(items = []) { this.items = items; this.cancelled = []; this.published = []; this.serial = 10; }
  async current() { return this.items.slice(); }
  async publish(item) {
    this.published.push(item);
    this.items.push(new ScheduledReminder(this.serial++, item.notificationId, item.title, item.due));
  }
  async cancel(id) {
    this.cancelled.push(id); this.items = this.items.filter(item => item.reminderId !== id);
  }
}

test('reminders include only future, unfinished, personally relevant tasks', () => {
  const state = seed(morning);
  assert.deepEqual(desiredReminders(state, morning.getTime()).map(item => item.title), [state.tasks[0].title, state.tasks[1].title]);
  Rules.toggleTask(state, 't1', 1);
  assert.equal(desiredReminders(state, morning.getTime()).length, 1);
  assert.equal(desiredReminders(state, new Date(2026, 10, 3, 21).getTime()).length, 0);
});

test('unchanged schedules are retained across restarts and repeated syncs', async () => {
  const desired = desiredReminders(seed(morning), morning.getTime());
  const port = new FakeSystem();
  await reconcileReminders(port, desired); await reconcileReminders(port, desired);
  assert.equal(port.published.length, 2); assert.equal(port.cancelled.length, 0);
});

test('imported sub-minute and fractional-second deadlines retain platform precision without repeated replacement', async () => {
  const state = seed(morning);
  state.tasks[0].due = new Date(2026, 10, 3, 9, 12, 37, 250).toISOString();
  const desired = desiredReminders(state, morning.getTime());
  assert.equal(desired[0].due, new Date(2026, 10, 3, 9, 12, 38).toISOString());
  assert.equal(new Date(desired[0].due).getTime() - new Date(state.tasks[0].due).getTime(), 750);
  const port = new FakeSystem();
  await reconcileReminders(port, desired);
  await reconcileReminders(port, desiredReminders(state, morning.getTime()));
  assert.equal(port.published.length, 2); assert.equal(port.cancelled.length, 0);
});

test('editing due time or title replaces the previous reminder', async () => {
  const state = seed(morning); const port = new FakeSystem();
  await reconcileReminders(port, desiredReminders(state, morning.getTime()));
  Rules.saveTask(state, 't1', 'personal', '新标题', '', 'lin', '2026-11-03T10:00', 0, 1);
  await reconcileReminders(port, desiredReminders(state, morning.getTime()));
  assert.equal(port.cancelled.length, 1); assert.equal(port.published.length, 3);
  assert.ok(port.items.some(item => item.title === '新标题' && item.due === new Date('2026-11-03T10:00').toISOString()));
});

test('completed, deleted and reassigned tasks cancel their pending reminders', async () => {
  for (const action of [
    state => Rules.toggleTask(state, 't2', 1),
    state => Rules.deleteTask(state, 't2', 1),
    state => Rules.saveTask(state, 't2', 'weekend', '路线', '', 'chen', '2026-11-03T20:00', 0, 1)
  ]) {
    const state = seed(morning); const port = new FakeSystem();
    await reconcileReminders(port, desiredReminders(state, morning.getTime()));
    action(state);
    await reconcileReminders(port, desiredReminders(state, morning.getTime()));
    assert.equal(port.items.length, 1); assert.equal(port.cancelled.length, 1);
  }
});

test('switching members replaces prior member reminders and permission revocation clears them', async () => {
  const state = seed(morning); const port = new FakeSystem();
  await reconcileReminders(port, desiredReminders(state, morning.getTime()));
  state.user = 'chen';
  await reconcileReminders(port, desiredReminders(state, morning.getTime()));
  assert.equal(port.items.length, 0);
  state.user = 'lin'; await reconcileReminders(port, desiredReminders(state, morning.getTime()));
  await reconcileReminders(port, []);
  assert.equal(port.items.length, 0);
});

test('reconciliation removes duplicate system entries without republishing a matching reminder', async () => {
  const desired = new DesiredReminder(1, '散步', '2026-11-03T20:00');
  const port = new FakeSystem([new ScheduledReminder(10, 1, desired.title, desired.due), new ScheduledReminder(11, 1, desired.title, desired.due)]);
  await reconcileReminders(port, [desired]);
  assert.deepEqual(port.cancelled, [11]); assert.equal(port.published.length, 0);
});

test('partial system failures are retryable without duplicating successful reminders', async () => {
  const desired = desiredReminders(seed(morning), morning.getTime()); const port = new FakeSystem();
  const publish = port.publish.bind(port); let fail = true;
  port.publish = async item => {
    if (fail && port.published.length === 1) throw new Error('system limit');
    await publish(item);
  };
  await assert.rejects(reconcileReminders(port, desired), /system limit/);
  assert.equal(port.items.length, 1);
  fail = false; await reconcileReminders(port, desired);
  assert.equal(port.items.length, 2); assert.equal(port.published.length, 2);
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('logout awaits cleanup even when the old in-flight publish fails after reaching the system', async () => {
  const port = new FakeSystem(); const started = deferred(); const release = deferred();
  const publish = port.publish.bind(port);
  port.publish = async item => {
    await publish(item); started.resolve(); await release.promise;
    throw new Error('old account publish response lost');
  };
  const coordinator = new ReminderCoordinator(port, async () => true, () => morning.getTime());
  const active = coordinator.sync(seed(morning));
  await started.promise;
  assert.equal(port.items.length, 1);
  const logout = coordinator.sync(new AppState());
  assert.equal(logout, active, 'logout must await the active drain');
  let settled = false; logout.then(() => { settled = true; });
  await Promise.resolve(); assert.equal(settled, false);
  release.resolve();
  assert.match(await logout, /0 项/);
  assert.equal(port.items.length, 0); assert.equal(port.published.length, 1);
});

test('member switches supersede a pending system query without publishing old account tasks', async () => {
  const port = new FakeSystem(); const started = deferred(); const release = deferred();
  const current = port.current.bind(port); let first = true;
  port.current = async () => {
    if (first) { first = false; started.resolve(); await release.promise; }
    return current();
  };
  const coordinator = new ReminderCoordinator(port, async () => true, () => morning.getTime());
  const old = coordinator.sync(seed(morning)); await started.promise;
  const other = seed(morning); other.user = 'chen';
  const switched = coordinator.sync(other);
  release.resolve(); await Promise.all([old, switched]);
  assert.equal(port.published.length, 0); assert.equal(port.items.length, 0);
});

test('the latest reconciliation failure reaches all waiters and a later sync can retry', async () => {
  const port = new FakeSystem(); const current = port.current.bind(port);
  port.current = async () => { throw new Error('system unavailable'); };
  const coordinator = new ReminderCoordinator(port, async () => true, () => morning.getTime());
  const first = coordinator.sync(seed(morning)); const second = coordinator.sync(seed(morning));
  assert.equal(first, second);
  await assert.rejects(first, /system unavailable/);
  await assert.rejects(second, /system unavailable/);
  port.current = current;
  assert.match(await coordinator.sync(seed(morning)), /2 项/);
  assert.equal(port.items.length, 2);
});

test('queued requests capture their snapshot and omit deadlines that elapsed while awaiting permission', async () => {
  const port = new FakeSystem(); const permission = deferred(); let now = morning.getTime();
  const coordinator = new ReminderCoordinator(port, () => permission.promise, () => now);
  const state = seed(morning); const firstTitle = state.tasks[1].title;
  const result = coordinator.sync(state);
  state.tasks[1].title = 'later unsynced mutation';
  now = new Date(2026, 10, 3, 10).getTime(); permission.resolve(true);
  assert.match(await result, /1 项/);
  assert.equal(port.items[0].title, firstTitle);
});

test('only the nearest 30 reminders are scheduled and later syncs promote remaining tasks', async () => {
  const port = new FakeSystem(); const state = seed(morning);
  state.tasks = Array.from({ length: 35 }, (_, index) => new Task(`limit-${index}`, 'personal', `提醒${index}`, '',
    'lin', new Date(morning.getTime() + (index + 1) * 60000).toISOString(), index));
  const coordinator = new ReminderCoordinator(port, async () => true, () => morning.getTime());
  assert.match(await coordinator.sync(state), /30 项.*5 项/);
  assert.equal(port.items.length, 30);
  assert.ok(!port.items.some(item => item.title === '提醒30'));
  state.tasks[0].done = true;
  await coordinator.sync(state);
  assert.equal(port.items.length, 30);
  assert.ok(port.items.some(item => item.title === '提醒30'));
  assert.ok(!port.items.some(item => item.title === '提醒0'));
});

test('logout clears existing reminders even if querying notification permission fails', async () => {
  const port = new FakeSystem();
  await reconcileReminders(port, desiredReminders(seed(morning), morning.getTime()));
  const coordinator = new ReminderCoordinator(port, async () => { throw new Error('permission service offline'); }, () => morning.getTime());
  await coordinator.sync(new AppState());
  assert.equal(port.items.length, 0);
});
