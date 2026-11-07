import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';

const html = await readFile(new URL('../prototype.html', import.meta.url), 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];
const token = 'a'.repeat(64);
const pause = (ms = 25) => new Promise(resolve => setTimeout(resolve, ms));
const clone = value => JSON.parse(JSON.stringify(value));

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fresh() {
  return {
    schema: 1, user: 'u1',
    people: [{ id: 'u1', name: '林小满' }, { id: 'u2', name: '陈一舟' }],
    lists: [{ id: 'weekend', name: '周末出逃计划', owner: 'u1', members: ['u1', 'u2'], version: 1, inviteExpires: 0 }],
    tasks: [{ id: 't1', title: '一起选徒步路线', note: '', listId: 'weekend', assignee: 'u1', due: '', done: false, version: 1, created: 1 }],
    libraries: [{ id: 'lib1', name: '森林来信', mode: 'combine', slots: [['慢慢的', '听雨的'], ['小水獭', '小狐狸']], owner: 'u1', version: 1 }],
    records: []
  };
}

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => clone(body) };
}
function failure(status, code, message) {
  return response(status, { error: { code, message } });
}

function serve(state, calls = []) {
  return async (input, init = {}) => {
    const path = new URL(String(input)).pathname;
    const method = String(init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : {};
    if (method === 'POST' && path === '/api/v1/auth/login') {
      return response(200, { token, userId: 'u1', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    }
    if (method === 'POST' && path === '/api/v1/auth/logout') return response(200, { ok: true });
    if (method === 'GET' && path === '/api/v1/state') return response(200, state);
    if (method === 'POST' && path === '/api/v1/invitations/lookup') {
      return response(200, { id: 'weekend', name: '周末出逃计划', memberCount: 2, alreadyJoined: false });
    }
    if (method === 'POST' && path === '/api/v1/invitations/join') {
      calls.push(body.code);
      return response(200, { id: 'weekend', version: 2 });
    }

    const taskMatch = path.match(/^\/api\/v1\/tasks\/([^/]+)$/);
    if (taskMatch && method === 'PATCH') {
      const task = state.tasks.find(item => item.id === taskMatch[1]);
      if (!task) return failure(404, 'NOT_FOUND', '待办不存在');
      if (task.version !== body.version) return failure(409, 'CONFLICT', '内容已被其他成员修改，请刷新后重新编辑');
      task.title = body.title; task.note = body.note; task.assignee = body.assignee;
      task.due = body.due; task.done = body.done; task.version++;
      return response(200, { id: task.id, version: task.version });
    }
    const createTask = path.match(/^\/api\/v1\/lists\/([^/]+)\/tasks$/);
    if (createTask && method === 'POST') {
      const task = { id: body.id, title: body.title, note: body.note, listId: createTask[1], assignee: body.assignee,
        due: body.due, done: false, version: 1, created: Date.now() };
      state.tasks.push(task);
      return response(201, { id: task.id, version: 1 });
    }
    const invite = path.match(/^\/api\/v1\/lists\/([^/]+)\/invitation$/);
    if (invite && method === 'POST') {
      const list = state.lists.find(item => item.id === invite[1]);
      if (!list) return failure(404, 'NOT_FOUND', '清单不存在');
      if (list.version !== body.version) return failure(409, 'CONFLICT', '内容已被其他成员修改，请刷新后重新编辑');
      list.version++; list.inviteExpires = Date.now() + 7 * 86400000;
      return response(201, { code: 'SHIRI-0123456789ABCDEF01234567', expiresAt: new Date(list.inviteExpires).toISOString(), version: list.version });
    }
    if (method === 'POST' && path === '/api/v1/records') {
      const record = { ...body, id: body.id, owner: 'u1', savedAt: new Date().toISOString(), sharedTo: [], version: 1 };
      state.records.push(record);
      return response(201, { id: record.id, version: 1 });
    }
    const share = path.match(/^\/api\/v1\/records\/([^/]+)\/shares$/);
    if (share && method === 'PATCH') {
      const record = state.records.find(item => item.id === share[1]);
      if (!record) return failure(404, 'NOT_FOUND', '记录不存在');
      if (record.version !== body.version) return failure(409, 'CONFLICT', '内容已被其他成员修改，请刷新后重新编辑');
      record.sharedTo = [...new Set(body.listIds)];
      record.version++;
      return response(200, { id: record.id, version: record.version });
    }
    return failure(404, 'NOT_FOUND', `未模拟的请求：${method} ${path}`);
  };
}

async function openOnline() {
  const window = new Window({ url: 'http://localhost:5173' });
  const state = fresh();
  const calls = [];
  window.document.body.innerHTML = '<div id="root"></div>';
  window.fetch = serve(state, calls);
  window.confirm = () => true;
  window.eval(code);
  const doc = window.document;
  const waitFor = async check => {
    for (let i = 0; i < 120; i++) { if (check()) return; await pause(20); }
    assert.fail(`等待超时：${doc.body.textContent.slice(0, 300)}`);
  };
  const findButton = (text, root = doc) => {
    const button = [...root.querySelectorAll('button')].find(item => item.textContent.trim() === text);
    assert.ok(button, `缺少按钮：${text}`);
    return button;
  };
  const setValue = async (selector, value) => {
    const element = doc.querySelector(selector); assert.ok(element, `缺少输入：${selector}`);
    const prototype = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
    await pause();
  };
  const click = async element => { assert.ok(element, '缺少可点击元素'); element.click(); await pause(); };
  await waitFor(() => doc.querySelector('input[name="username"]'));
  await setValue('input[name="address"]', 'http://127.0.0.1:3000');
  await setValue('input[name="username"]', 'xiaoman');
  await setValue('input[name="password"]', 'test-password-123');
  await click(findButton('登录'));
  await waitFor(() => doc.querySelector('.task-row'));
  return { window, doc, state, calls, findButton, setValue, click, waitFor };
}

test('online login, task creation and conflict recovery keep the reload action visible', async () => {
  const app = await openOnline();
  try {
    await app.click(app.findButton('新建待办'));
    await app.setValue('input[name="title"]', '在线验收：散步十分钟');
    await app.click(app.findButton('记下这件事'));
    await app.waitFor(() => app.doc.body.textContent.includes('在线验收：散步十分钟'));
    assert.ok(app.state.tasks.some(task => task.title === '在线验收：散步十分钟'));

    await app.click(app.doc.querySelector('.task-content'));
    app.state.tasks.find(task => task.id === 't1').version = 2;
    app.state.tasks.find(task => task.id === 't1').title = '他人修改';
    await app.click(app.findButton('保存修改'));
    await app.waitFor(() => app.doc.querySelector('.modal')?.textContent.includes('载入最新内容'));
    assert.ok(app.findButton('载入最新内容'));

    await app.click(app.findButton('刷新'));
    await app.waitFor(() => app.doc.querySelector('.modal')?.textContent.includes('载入最新内容'));
    assert.ok(app.findButton('载入最新内容'), '自动刷新不应清掉冲突恢复入口');

    await app.click(app.findButton('载入最新内容'));
    await app.waitFor(() => app.doc.querySelector('input[name="title"]')?.value === '他人修改');
    assert.equal(app.doc.querySelector('input[name="title"]').value, '他人修改');
  } finally { app.window.happyDOM.close(); }
});

test('online name save, calendar view and sharing use the server boundaries', async () => {
  const app = await openOnline();
  try {
    await app.click(app.findButton('名字灵感'));
    await app.click(app.findButton('生成一个名字'));
    await app.waitFor(() => (app.doc.querySelector('.name-stage h2')?.textContent || '').length > 0 &&
      !app.doc.querySelector('.name-stage h2').textContent.includes('下一个好名字'));
    const generated = app.doc.querySelector('.name-stage h2').textContent;
    await app.click(app.findButton('喜欢，保存到日历'));
    await app.waitFor(() => app.state.records.length === 1);
    assert.equal(app.state.records[0].name, generated);
    assert.equal(app.state.records[0].date, dateKey());

    await app.click(app.findButton('名字日历'));
    await app.waitFor(() => [...app.doc.querySelectorAll('.record-card h3')].some(item => item.textContent === generated));
    const card = [...app.doc.querySelectorAll('.record-card')].find(item => item.querySelector('h3')?.textContent === generated);
    await app.click([...card.querySelectorAll('button')].find(item => item.textContent.trim() === '分享'));
    await app.click(app.doc.querySelector('.share-choices input'));
    await app.click(app.findButton('保存分享设置'));
    await app.waitFor(() => app.state.records[0].sharedTo.includes('weekend'));
    assert.deepEqual(app.state.records[0].sharedTo, ['weekend']);
  } finally { app.window.happyDOM.close(); }
});

test('online invitation generation uses a body payload and shows the code', async () => {
  const app = await openOnline();
  try {
    const list = [...app.doc.querySelectorAll('.list-nav')].find(item => item.textContent.includes('周末出逃计划'));
    await app.click(list);
    await app.click(app.doc.querySelector('.list-info-bar>button'));
    await app.click(app.findButton('生成邀请码'));
    await app.waitFor(() => (app.doc.querySelector('dialog')?.textContent || '').includes('SHIRI-0123456789ABCDEF01234567'));
    assert.ok(app.state.lists[0].inviteExpires > Date.now());
  } finally { app.window.happyDOM.close(); }
});

test('online invitation lookup and join submit the code in the request body', async () => {
  const app = await openOnline();
  try {
    await app.click(app.findButton('通过邀请加入清单'));
    await app.setValue('dialog input', 'shiri-0123456789abcdef01234567');
    await app.click(app.findButton('查找邀请'));
    await app.waitFor(() => (app.doc.querySelector('dialog')?.textContent || '').includes('周末出逃计划'));
    await app.click(app.findButton('确认加入'));
    await app.waitFor(() => app.calls.length === 1);
    assert.deepEqual(app.calls, ['SHIRI-0123456789ABCDEF01234567']);
  } finally { app.window.happyDOM.close(); }
});
