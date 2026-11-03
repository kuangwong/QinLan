import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';

const html = await readFile(new URL('../prototype.html', import.meta.url), 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];
const key = 'shiri-prototype-v1';
const pause = (ms = 25) => new Promise(resolve => setTimeout(resolve, ms));

async function open(saved) {
  const window = new Window({ url: 'http://localhost:5173' });
  if (saved) window.localStorage.setItem(key, JSON.stringify(saved));
  window.document.body.innerHTML = '<div id="root"></div>';
  window.eval(code);
  for (let i = 0; i < 50; i++) {
    if (window.document.querySelector('h1') && window.localStorage.getItem(key)) break;
    await pause(20);
  }
  const doc = window.document;
  function findButton(text, root = doc) {
    const button = [...root.querySelectorAll('button')].find(b => b.textContent.trim() === text);
    assert.ok(button, `Missing button: ${text}`);
    return button;
  }
  return {
    window, doc,
    state: () => JSON.parse(window.localStorage.getItem(key)),
    async click(selector) { const el = typeof selector === 'string' ? doc.querySelector(selector) : selector; assert.ok(el, `Missing element: ${selector}`); el.click(); await pause(); },
    async button(text, root) { findButton(text, root).click(); await pause(); },
    async value(selector, value) {
      const el = doc.querySelector(selector); assert.ok(el, `Missing field: ${selector}`);
      const prototype = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, value);
      el.dispatchEvent(new window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      await pause();
    },
    async nav(index) { doc.querySelectorAll('.primary-nav>button')[index].click(); await pause(); },
    async user(name) { doc.querySelector('.profile-button').click(); await pause(); const button = [...doc.querySelectorAll('.profile-menu>button')].find(b => b.querySelector('span:nth-child(2)')?.textContent === name); assert.ok(button); button.click(); await pause(); },
    async closeDialog() { doc.querySelector('[aria-label="关闭弹窗"]').click(); await pause(); },
    close: () => window.happyDOM.close(),
  };
}

test('standalone artifact includes all assets and mounts without a server', async () => {
  assert.ok(html.includes('<style>'));
  assert.ok(!/<script[^>]+src=/.test(html));
  assert.ok(!/<link[^>]+href="[^\"]+\.css/.test(html));
  const app = await open();
  try {
    assert.match(app.doc.querySelector('h1').textContent, /安排得刚刚好/);
    assert.equal(app.doc.querySelectorAll('.task-row').length, 5);
    assert.ok(app.state().tasks.length > 0);
  } finally { await app.close(); }
});

test('task creation, edit, completion, restoration, filtering and persistence', async () => {
  const app = await open(); let saved;
  try {
    await app.button('新建待办');
    await app.value('input[name="title"]', '原型验收：散步十分钟');
    await app.value('textarea[name="note"]', '去公园走走');
    await app.button('记下这件事');
    const task = app.state().tasks.find(t => t.title === '原型验收：散步十分钟');
    assert.ok(task); assert.equal(task.note, '去公园走走');
    await app.click('[aria-label="编辑：原型验收：散步十分钟"]');
    await app.value('input[name="title"]', '原型验收：散步二十分钟');
    await app.button('保存修改');
    assert.equal(app.state().tasks.find(t => t.id === task.id).title, '原型验收：散步二十分钟');
    await app.click('[aria-label="完成：原型验收：散步二十分钟"]');
    assert.equal(app.state().tasks.find(t => t.id === task.id).done, true);
    await app.click('[role="tab"]:last-child');
    await app.click('[aria-label="恢复：原型验收：散步二十分钟"]');
    assert.equal(app.state().tasks.find(t => t.id === task.id).done, false);
    await app.click('[role="tab"]:first-child');
    await app.value('[aria-label="搜索待办"]', '原型验收');
    assert.equal(app.doc.querySelectorAll('.task-row').length, 1);
    saved = app.state();
  } finally { await app.close(); }
  const reopened = await open(saved);
  try {
    assert.ok(reopened.doc.body.textContent.includes('原型验收：散步二十分钟'));
    await reopened.click('[aria-label="删除：原型验收：散步二十分钟"]');
    await reopened.button('确认');
    assert.ok(!reopened.state().tasks.some(t => t.title.includes('原型验收')));
  } finally { await reopened.close(); }
});

test('names save only on request; sharing appears to members and never creates tasks', async () => {
  const app = await open();
  try {
    const original = app.state();
    await app.nav(1);
    await app.button('生成一个名字'); await pause(430);
    const generated = app.doc.querySelector('.name-stage h2').textContent;
    assert.ok(generated.length > 0);
    assert.equal(app.state().records.length, original.records.length);
    await app.button('喜欢，保存到日历');
    assert.equal(app.state().records.length, original.records.length + 1);
    assert.equal(app.state().tasks.length, original.tasks.length);
    const record = app.state().records[0];
    assert.equal(record.name, generated); assert.equal(record.source, '森林来信');
    await app.nav(2);
    const card = [...app.doc.querySelectorAll('.record-card')].find(c => c.querySelector('h3').textContent === generated);
    await app.button('分享', card);
    await app.click('.share-choices input');
    await app.button('保存分享设置');
    assert.ok(app.state().records.find(r => r.id === record.id).sharedTo.includes('weekend'));
    await app.user('陈一舟'); await app.nav(2);
    assert.ok(![...app.doc.querySelectorAll('.record-card h3')].some(h => h.textContent === generated));
    await app.value('[aria-label="日历记录范围"]', 'weekend');
    assert.ok([...app.doc.querySelectorAll('.record-card h3')].some(h => h.textContent === generated));
    assert.ok(!app.doc.querySelector(`[aria-label="删除记录：${generated}"]`));
    assert.equal(app.state().tasks.length, original.tasks.length);
  } finally { await app.close(); }
});

test('libraries deduplicate text, combine three ordered slots and preserve saved history on deletion', async () => {
  const app = await open();
  try {
    await app.nav(1); await app.button('管理我的词库'); await app.button('新建词库');
    await app.value('input[name="name"]', '三组小宇宙');
    await app.value('.slot-editors textarea', '温柔的\n\n温柔的\n');
    await app.value('.slot-editors>label:nth-child(2) textarea', '森林');
    await app.button('添加第三个词组');
    await app.value('.slot-editors>label:nth-child(3) textarea', '旅人');
    await app.button('保存词库');
    const library = app.state().libraries.find(l => l.name === '三组小宇宙');
    assert.deepEqual(library.slots, [['温柔的'], ['森林'], ['旅人']]);
    await app.button('返回生成器'); await app.button('生成一个名字'); await pause(430);
    assert.equal(app.doc.querySelector('.name-stage h2').textContent, '温柔的森林旅人');
    await app.button('喜欢，保存到日历');
    await app.button('管理我的词库');
    await app.click('[aria-label="删除词库：三组小宇宙"]'); await app.button('确认');
    assert.ok(!app.state().libraries.some(l => l.id === library.id));
    assert.ok(app.state().records.some(r => r.name === '温柔的森林旅人' && r.source === '三组小宇宙'));
  } finally { await app.close(); }
});

test('invitation joins a list; ordinary members cannot manage it; owner removal unassigns open tasks', async () => {
  const app = await open();
  try {
    await app.click('[aria-label="新建个人清单"]');
    await app.value('input[name="name"]', '一起测试清单'); await app.button('创建清单');
    const listId = app.state().lists.find(l => l.name === '一起测试清单').id;
    await app.click('.list-info-bar>button'); await app.button('生成邀请码');
    const invite = app.state().lists.find(l => l.id === listId).invite;
    assert.ok(invite); await app.closeDialog();
    await app.user('陈一舟'); await app.button('通过邀请加入清单');
    await app.value('dialog input', invite); await app.button('查找邀请'); await app.button('确认加入');
    assert.ok(app.state().lists.find(l => l.id === listId).members.includes('chen'));
    await app.click('.list-info-bar>button');
    assert.ok(app.doc.querySelector('dialog').textContent.includes('退出清单'));
    assert.ok(!app.doc.querySelector('dialog').textContent.includes('生成邀请码'));
    assert.ok(!app.doc.querySelector('dialog').textContent.includes('删除清单'));
    await app.closeDialog(); await app.user('林小满');
    await app.click([...app.doc.querySelectorAll('.list-nav')].find(b => b.textContent.includes('一起测试清单')));
    await app.button('新建待办'); await app.value('input[name="title"]', '分给一舟的小事');
    await app.value('dialog .form-two-columns select', 'chen'); await app.button('记下这件事');
    assert.equal(app.state().tasks.find(t => t.title === '分给一舟的小事').assignee, 'chen');
    await app.click('.list-info-bar>button'); await app.click('[aria-label="移除陈一舟"]'); await app.button('确认');
    assert.equal(app.state().tasks.find(t => t.title === '分给一舟的小事').assignee, '');
    assert.ok(!app.state().lists.find(l => l.id === listId).members.includes('chen'));
  } finally { await app.close(); }
});
