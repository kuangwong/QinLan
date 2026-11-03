import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import DemoApp from './App';
import { Avatar, Empty, Modal, MonthCalendar, PeopleContext } from './components';
import { CalendarDays, Check, Leaf, ListTodo, Plus, Share2, Sparkles, Trash2, Users } from './icons';
import { dateKey } from './data';
import { ApiError, cleanWords, getSnapshot, localTime, newId, rememberSession, request, restoreSession, serviceAddress, utcTime } from './api';
import type { OnlineLibrary, OnlineList, OnlineRecord, OnlineTask, Session, Snapshot } from './api';

type Tab = 'tasks' | 'names' | 'calendar';
type Editor = { kind: 'task'; value: OnlineTask } | { kind: 'list'; value: OnlineList } |
  { kind: 'library'; value: OnlineLibrary } | { kind: 'share'; value: OnlineRecord } |
  { kind: 'members'; value: OnlineList } | { kind: 'join' };
type Creation = { kind: 'tasks' | 'lists' | 'libraries' | 'records'; id: string };
type MutationResult = { code?: string };
type Run = (method: string, path: string, body: object | undefined, done?: (result: MutationResult) => void, creation?: Creation) => Promise<boolean>;
type Generated = { id: string; name: string; mode: 'full' | 'combine'; source: string; date: string };
const message = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试';
const versionBody = (value: { version: number }) => ({ version: value.version });

export default function OnlineApp() {
  const [demo, setDemo] = useState(false);
  const [session, setSession] = useState<Session | null>(restoreSession);
  const [data, setData] = useState<Snapshot | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<Tab>('tasks');
  const [scope, setScope] = useState('mine');
  const [status, setStatus] = useState('pending');
  const [assignee, setAssignee] = useState('all');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [month, setMonth] = useState(new Date());
  const [selected, setSelected] = useState(dateKey());
  const [calendarScope, setCalendarScope] = useState('mine');
  const [clock, setClock] = useState(Date.now());
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [saved, setSaved] = useState(false);
  const [libraryId, setLibraryId] = useState('');
  const [mode, setMode] = useState<'full' | 'combine'>('combine');
  const [manageLibraries, setManageLibraries] = useState(false);
  const [showDue, setShowDue] = useState(false);
  const [notifications, setNotifications] = useState('浏览器提醒尚未启用');
  const [recoveryPending, setRecoveryPending] = useState(false);
  const gate = useRef(false);
  const completion = useRef<(() => void) | null>(null);
  const uncertain = useRef<(Creation & { done: () => void }) | null>(null);
  const notified = useRef(new Set<string>());

  function failure(reason: unknown) {
    setError(message(reason));
    setConflict(reason instanceof ApiError && [404, 409].includes(reason.status));
    if (reason instanceof ApiError && reason.status === 401) { setExpired(true); rememberSession(null); }
  }

  const refresh = useCallback(async () => {
    if (!session || gate.current) return;
    gate.current = true; setBusy(true);
    try {
      const latest = await getSnapshot(session);
      setData(latest); setExpired(false); setError(''); setConflict(false);
      if (completion.current) { const done = completion.current; completion.current = null; done(); }
      if (uncertain.current) {
        const pending = uncertain.current; uncertain.current = null;
        if (latest[pending.kind].some(item => item.id === pending.id)) { pending.done(); setNotice('已确认上次操作保存成功'); }
        else setNotice('已确认服务端尚无该条记录，可以重试保存');
      }
      setRecoveryPending(false);
    } catch (reason) { failure(reason); }
    finally { gate.current = false; setBusy(false); }
  }, [session]);

  useEffect(() => { if (session && !demo) void refresh(); }, [session, demo, refresh]);
  useEffect(() => {
    if (!session || demo) return;
    const foreground = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', foreground);
    window.addEventListener('focus', foreground);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && ((tab === 'tasks' && scope !== 'mine') || (tab === 'calendar' && calendarScope !== 'mine'))) void refresh();
    }, 30000);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', foreground); window.removeEventListener('focus', foreground); };
  }, [session, demo, tab, scope, calendarScope, refresh]);
  useEffect(() => { if (session && data) void refresh(); }, [tab, scope, calendarScope, month, session, refresh]);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!data) return;
    if (scope !== 'mine' && !data.lists.some(list => list.id === scope)) setScope('mine');
    if (calendarScope !== 'mine' && !data.lists.some(list => list.id === calendarScope && list.members.length > 1)) setCalendarScope('mine');
  }, [data, scope, calendarScope]);
  useEffect(() => {
    if (!data || expired || demo || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    data.tasks.filter(task => relevant(task, data) && !task.done && task.due && new Date(task.due).getTime() <= clock).forEach(task => {
      const key = `${data.user}:${task.id}:${task.due}`;
      if (notified.current.has(key)) return;
      try { new Notification('拾日 · 待办到期', { body: task.title, tag: key }); notified.current.add(key); }
      catch { setNotifications('此浏览器无法发送通知，仍可查看应用内到期提示'); }
    });
  }, [data, expired, demo, clock]);

  const run: Run = async (method, path, body, done = () => setEditor(null), creation) => {
    if (!session || gate.current || expired || recoveryPending) return false;
    gate.current = true; setBusy(true); setError(''); setConflict(false);
    let committed = false;
    try {
      const result = await request<MutationResult>(session.baseUrl, session.token, method, path, body); committed = true;
      completion.current = () => done(result);
      const latest = await getSnapshot(session); setData(latest); completion.current = null; done(result); setNotice('已保存');
      return true;
    } catch (reason) {
      failure(reason);
      if (committed) { setRecoveryPending(true); setError('操作已提交，但刷新失败。请先刷新确认结果。当前输入已保留。'); }
      else if (creation && reason instanceof ApiError && (reason.status === 0 || reason.code === 'INVALID_RESPONSE')) {
        uncertain.current = { ...creation, done: () => done({}) }; setRecoveryPending(true);
        setError('未能确认保存结果，当前输入已保留。请先刷新确认，再重试。');
      }
      return false;
    } finally { gate.current = false; setBusy(false); }
  };

  async function authenticate(baseUrl: string, username: string, password: string, name?: string) {
    const address = serviceAddress(baseUrl);
    const result = await request<Omit<Session, 'baseUrl'>>(address, '', 'POST', name === undefined ? '/auth/login' : '/auth/register',
      { username, password, ...(name === undefined ? {} : { name }) });
    const next = { ...result, baseUrl: address };
    if (data && next.userId !== data.user) {
      await request(address, next.token, 'POST', '/auth/logout').catch(() => undefined);
      throw new Error('当前草稿属于原账号，请使用原账号重新登录，或先退出当前账号');
    }
    if (!rememberSession(next)) setNotice('浏览器会话存储不可用，刷新页面后需要重新登录');
    setSession(next); setExpired(false);
  }

  async function logout() {
    if (gate.current) return;
    if ((editor || generated && !saved) && !window.confirm('退出将清除当前未保存的输入，确认退出？')) return;
    gate.current = true; setBusy(true);
    let remoteError = false;
    try { if (session) await request(session.baseUrl, session.token, 'POST', '/auth/logout'); }
    catch { remoteError = true; }
    finally {
      rememberSession(null); setSession(null); setData(null); setExpired(false); setEditor(null); setError('');
      setGenerated(null); setSaved(false); setLibraryId(''); setMode('combine'); setManageLibraries(false);
      setTab('tasks'); setScope('mine'); setCalendarScope('mine'); setQuery(''); setAssignee('all'); setStatus('pending');
      setMonth(new Date()); setSelected(dateKey()); setShowDue(false); setConflict(false); notified.current.clear();
      completion.current = null; uncertain.current = null; setRecoveryPending(false); gate.current = false; setBusy(false);
      setNotice(remoteError ? '本页已退出；服务暂时无法连接，远端会话未能撤销。' : '已退出登录');
    }
  }

  async function reloadDraft() {
    if (!session || gate.current || !window.confirm('载入最新内容会替换当前草稿，确认继续？')) return;
    gate.current = true; setBusy(true);
    try {
      const latest = await getSnapshot(session); setData(latest);
      if (editor && 'value' in editor) {
        const collection = editor.kind === 'task' ? latest.tasks : editor.kind === 'library' ? latest.libraries : editor.kind === 'share' ? latest.records : latest.lists;
        const value = collection.find(item => item.id === editor.value.id);
        if (value) setEditor({ ...editor, value } as Editor);
        else { setEditor(null); setNotice('该内容已删除或你已失去访问权限'); }
      }
      setError(''); setConflict(false);
    } catch (reason) { failure(reason); }
    finally { gate.current = false; setBusy(false); }
  }

  if (demo) return <><div className='demo-exit'><span>本地演示，与联网账号的数据独立</span><button className='button secondary' onClick={() => setDemo(false)}>返回登录</button></div><DemoApp /></>;
  if (!session || expired) return <AuthForm key={expired ? 'reauth' : 'login'} initialAddress={session?.baseUrl || ''} onSubmit={authenticate}
    onDemo={!data ? () => setDemo(true) : undefined} onLogout={data ? logout : undefined} notice={expired ? '登录已过期，草稿仍保留。请使用原账号重新登录。' : notice} />;
  if (!data) return <div className='online-loading card'><Leaf size={36} /><h1>正在连接你的小天地</h1>
    {error && <p role='alert'>{error}</p>}<button className='button primary' disabled={busy} onClick={() => void refresh()}>重新连接</button>
    <button className='button secondary' disabled={busy} onClick={() => void logout()}>退出登录</button></div>;

  const today = dateKey(new Date(clock));
  const user = data.people.find(person => person.id === data.user)!;
  const selectedList = data.lists.find(list => list.id === scope);
  const shared = data.lists.filter(list => list.members.length > 1);
  const tasks = data.tasks.filter(task => scope === 'mine' ? relevant(task, data) : task.listId === scope);
  const filtered = tasks.filter(task => (status === 'all' || task.done === (status === 'done')) && (assignee === 'all' || task.assignee === assignee) &&
    `${task.title} ${task.note}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(a.done) - Number(b.done) || (a.due || '9999').localeCompare(b.due || '9999') || a.created - b.created);
  const due = data.tasks.filter(task => relevant(task, data) && !task.done && task.due && new Date(task.due).getTime() <= clock);
  const libraries = data.libraries.filter(library => library.mode === mode);
  const library = libraries.find(item => item.id === libraryId) || libraries[0];
  const records = data.records.filter(record => calendarScope === 'mine' ? record.owner === data.user : record.sharedTo.includes(calendarScope));
  const people = data.people.map(person => ({ ...person, color: 'sage' }));
  const closeEditor = () => { if (!busy && (!recoveryPending || window.confirm('保存结果仍待确认，关闭后请先刷新。确认关闭？'))) { setEditor(null); setError(''); setConflict(false); } };
  const createTask = () => setEditor({ kind: 'task', value: { id: newId(), title: '', note: '', listId: selectedList?.id || data.lists[0]?.id || '',
    assignee: data.user, due: '', done: false, version: 0, created: clock } });
  const createLibrary = () => setEditor({ kind: 'library', value: { id: newId(), name: '', mode, slots: mode === 'full' ? [[]] : [[], []], owner: data.user, version: 0 } });
  const deleteItem = (kind: string, value: { id: string; version: number }, label: string) => {
    if (window.confirm(label)) void run('DELETE', `/${kind}/${value.id}`, versionBody(value), () => setEditor(null));
  };
  const editorKey = editor && 'value' in editor ? `${editor.kind}:${editor.value.id}:${editor.value.version}` : editor?.kind;

  return <PeopleContext.Provider value={people}><div className='online-app'>
    <aside className='online-sidebar'>
      <a className='brand' href='#' onClick={event => { event.preventDefault(); setTab('tasks'); setScope('mine'); }}><span className='brand-mark'><Leaf size={25} /></span><strong>拾日<span>SHIRI</span></strong></a>
      <p className='online-caption'>让日常，多一点美好</p>
      <nav className='primary-nav' aria-label='主要导航'>{([['tasks', '我的待办', <ListTodo size={19} />], ['names', '名字灵感', <Sparkles size={19} />], ['calendar', '名字日历', <CalendarDays size={19} />]] as [Tab, string, ReactNode][]).map(([id, label, icon]) =>
        <button key={id} className={tab === id && (id !== 'tasks' || scope === 'mine') ? 'active' : ''} onClick={() => { setTab(id); if (id === 'tasks') setScope('mine'); }}>{icon}<span>{label}</span></button>)}</nav>
      <div className='online-list-heading'><span>我的清单</span><button className='icon-button' aria-label='新建清单' disabled={busy || recoveryPending} onClick={() => setEditor({ kind: 'list', value: { id: newId(), name: '', owner: data.user, members: [data.user], version: 0, inviteExpires: 0 } })}><Plus size={18} /></button></div>
      <div className='list-navigation'>{data.lists.map(list => <button className={`list-nav ${tab === 'tasks' && scope === list.id ? 'active' : ''}`} key={list.id} onClick={() => { setTab('tasks'); setScope(list.id); setAssignee('all'); setQuery(''); }}><span className='list-dot sage' /><span>{list.name}</span><small>{list.members.length > 1 ? <Users size={13} /> : '个人'}</small></button>)}</div>
      <button className='join-button' disabled={busy || recoveryPending} onClick={() => setEditor({ kind: 'join' })}>通过邀请加入清单</button>
      <div className='online-profile'><Avatar id={user.id} /><div><strong>{user.name}</strong><small>今天也要好好生活</small></div><button className='text-button' disabled={busy} onClick={() => void logout()}>退出</button></div>
    </aside>
    <div className='online-main'>
      <header className='online-topbar'><span>我的空间 / {tab === 'tasks' ? selectedList?.name || '我的待办' : tab === 'names' ? '名字灵感' : '名字日历'}</span><div><span className='online-connection'>{busy ? '同步中…' : error ? '需要重试' : '已连接'}</span><button className='button secondary' disabled={busy} onClick={() => void refresh()}>刷新</button><button className='button secondary' onClick={() => setShowDue(!showDue)}>到期提醒 {due.length || ''}</button></div></header>
      {notice && <div className='online-notice' role='status'>{notice}<button aria-label='关闭提示' onClick={() => setNotice('')}>×</button></div>}
      {!editor && error && <div className='online-error' role='alert'>{error}{conflict && <span> 请刷新后重新打开内容。</span>}</div>}
      <main className='online-content'>
        {tab === 'tasks' && <>
          <section className='online-heading'><div><div className='eyebrow'>{today} · 平常的一天，也值得期待</div><h1>{selectedList?.name || '把日子，安排得刚刚好。'}</h1><p>{selectedList ? `${selectedList.members.length} 位成员一起完成日常的小事。` : `嗨，${user.name}。一件一件，慢慢来。`}</p></div><button className='button primary' disabled={busy || recoveryPending} onClick={createTask}><Plus size={18} />新建待办</button></section>
          <div className='stats-row'><div className='stat-card'><span className='stat-icon sage'><ListTodo size={22} /></span><div><span>待完成</span><strong>{tasks.filter(task => !task.done).length}<small>件小事</small></strong></div></div><div className='stat-card'><span className='stat-icon peach'><CalendarDays size={22} /></span><div><span>今日待办</span><strong>{tasks.filter(task => !task.done && localTime(task.due).startsWith(today)).length}</strong></div></div><div className='stat-card'><span className='stat-icon lavender'><Check size={22} /></span><div><span>已经完成</span><strong>{tasks.filter(task => task.done).length}</strong></div></div></div>
          {selectedList && <div className='list-info-bar'><span>{selectedList.members.length > 1 ? '共享清单' : '个人清单'}</span><button onClick={() => setEditor({ kind: 'members', value: selectedList })}>{selectedList.owner === data.user ? '管理清单' : '查看成员'} <Users size={16} /></button></div>}
          <section className='card online-tasks'><div className='online-filters'><div className='online-tabs'>{[['pending', '待完成'], ['all', '全部'], ['done', '已完成']].map(([id, label]) => <button key={id} className={status === id ? 'active' : ''} onClick={() => setStatus(id)}>{label}</button>)}</div><label><span className='sr-only'>搜索待办</span><input aria-label='搜索待办' placeholder='搜索标题或备注' value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label='按负责人筛选' value={assignee} onChange={event => setAssignee(event.target.value)}><option value='all'>全部负责人</option><option value=''>未分配</option>{data.people.filter(person => !selectedList || selectedList.members.includes(person.id)).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></div><p className='online-sort'>按截止时间排序 · 未完成优先</p>
            {filtered.map(task => <article className={`task-row ${task.done ? 'done' : ''}`} key={task.id}><button className='task-check' aria-label={`${task.done ? '恢复' : '完成'}：${task.title}`} aria-pressed={task.done} disabled={busy || recoveryPending} onClick={() => void run('PATCH', `/tasks/${task.id}`, taskBody({ ...task, done: !task.done }), () => undefined)}>{task.done && <Check size={13} />}</button><button className='task-content' aria-label={`编辑：${task.title}`} onClick={() => setEditor({ kind: 'task', value: task })}><strong>{task.title}</strong><div className='task-meta'><span className='list-chip sage'>{data.lists.find(list => list.id === task.listId)?.name}</span><span className={`due-label ${task.due && new Date(task.due).getTime() <= clock ? 'late' : ''}`}>{task.due ? localTime(task.due).replace('T', ' ') : '未设截止时间'}</span>{task.note && <span className='online-task-note'>{task.note}</span>}</div></button><span className='online-assignee'>{task.assignee ? <Avatar id={task.assignee} small /> : '未分配'}</span><button className='icon-button danger-text' aria-label={`删除：${task.title}`} disabled={busy || recoveryPending} onClick={() => deleteItem('tasks', task, `删除「${task.title}」？`)}><Trash2 size={17} /></button></article>)}
            {!filtered.length && <Empty icon={<Leaf size={30} />} title='留一点空白，也很好' text='新增待办，或调整筛选条件。' />}
          </section>
        </>}
        {tab === 'names' && <>
          <section className='online-heading'><div><div className='eyebrow'>A LITTLE INSPIRATION</div><h1>好名字，恰好遇见。</h1><p>给灵感一点随机，给喜欢的名字留个位置。</p></div><button className='button secondary' onClick={() => setManageLibraries(!manageLibraries)}>{manageLibraries ? '返回生成器' : '管理我的词库'}</button></section>
          {manageLibraries ? <><button className='button primary' disabled={busy || recoveryPending} onClick={createLibrary}><Plus size={18} />新建词库</button><div className='library-grid online-library-grid'>{data.libraries.map(item => <article className='library-card card' key={item.id}><span className='library-icon lavender'><Sparkles size={25} /></span><h3>{item.name}</h3><p>{item.mode === 'full' ? '完整名称' : `${item.slots.length} 个有序词组`} · {item.slots.reduce((count, slot) => count + slot.length, 0)} 个候选</p><div className='library-preview'>{item.slots.map(slot => slot.slice(0, 3).join('、')).join(' ＋ ')}</div><div className='library-actions'><button className='button secondary' onClick={() => setEditor({ kind: 'library', value: item })}>编辑词库</button><button className='icon-button danger-text' disabled={busy || recoveryPending} aria-label={`删除词库：${item.name}`} onClick={() => deleteItem('libraries', item, `删除「${item.name}」？已保存的名字历史会保留。`)}><Trash2 size={18} /></button></div></article>)}</div></> : <section className='generator card online-generator'>
            <div className='mode-switch'><button className={mode === 'full' ? 'active' : ''} onClick={() => { setMode('full'); setGenerated(null); }}>完整名称抽取</button><button className={mode === 'combine' ? 'active' : ''} onClick={() => { setMode('combine'); setGenerated(null); }}>有序词组组合</button></div>
            <div className='generator-controls'><label>灵感来自<select aria-label='选择词库' value={library?.id || ''} onChange={event => { setLibraryId(event.target.value); setGenerated(null); }}><option disabled value=''>请选择词库</option>{libraries.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className='text-button' disabled={busy || recoveryPending} onClick={createLibrary}>添加词库</button></div>
            <div className='name-stage'><span className='stage-star star-one'>✧</span><span className='stage-star star-two'>✦</span><div className='name-stage-label'>小小的随机，大大的可能</div><div className='name-illustration'><Sparkles size={48} /></div><h2>{generated?.name || '下一个好名字，会是什么？'}</h2><p>{library ? library.mode === 'full' ? '从喜欢的名字中，随机抽取一个。' : `${library.slots.length} 个词组，按顺序相遇。` : '先创建词库，再开始探索。'}</p><button className='button purple-button' disabled={!library || busy || recoveryPending} onClick={() => { if (library?.slots.every(slot => slot.length)) { setGenerated({ id: newId(), name: library.slots.map(slot => slot[Math.floor(Math.random() * slot.length)]).join(''), mode: library.mode, source: library.name, date: '' }); setSaved(false); } }}>{generated ? '再遇见一个' : '生成一个名字'}</button>
              {generated && <button className='button secondary save-name' disabled={saved || busy || recoveryPending} onClick={() => { const record = { ...generated, date: generated.date || today }; setGenerated(record); void run('POST', '/records', record, () => setSaved(true), { kind: 'records', id: record.id }); }}>{saved ? '已收藏到日历' : '喜欢，保存到日历'}</button>}
            </div>
          </section>}
        </>}
        {tab === 'calendar' && <>
          <section className='online-heading'><div><div className='eyebrow'>LITTLE MEMORIES</div><h1>日子里，拾起的名字。</h1><p>每一份灵感，都有属于它的一天。</p></div></section>
          <div className='calendar-layout'><section className='card calendar-main'><div className='calendar-top'><select aria-label='日历记录范围' value={calendarScope} onChange={event => setCalendarScope(event.target.value)}><option value='mine'>我的名字日历</option>{shared.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}</select><button className='button secondary' onClick={() => { setMonth(new Date()); setSelected(today); }}>回到今天</button></div><MonthCalendar month={month} selected={selected} dates={records.map(record => record.date)} onMonth={setMonth} onSelect={setSelected} /><p className='online-sort'>有名字记录的日期标有圆点 · 可切换月份查看</p></section>
            <section className='card day-records'><div className='day-record-heading'><div className='eyebrow'>LITTLE MEMORIES</div><h2>{selected}</h2><p>{calendarScope === 'mine' ? '属于你的灵感碎片。' : '和伙伴们分享的小小灵感。'}</p></div><div className='records-list'>{records.filter(record => record.date === selected).map(record => <article className='record-card' key={record.id}><div className='record-top'><span className='record-mode'>{record.owner === data.user ? record.mode === 'full' ? '完整名称' : '词组组合' : '伙伴分享'}</span>{record.owner === data.user && <button className='icon-button danger-text' disabled={busy || recoveryPending} aria-label={`删除记录：${record.name}`} onClick={() => deleteItem('records', record, `删除「${record.name}」的这条记录及其分享？`)}><Trash2 size={16} /></button>}</div><h3>{record.name}</h3>{record.owner === data.user && <p>来自「{record.source}」</p>}<div className='record-bottom'><span><Avatar id={record.owner} small />{data.people.find(person => person.id === record.owner)?.name}</span>{record.owner === data.user && <button className='text-button' onClick={() => setEditor({ kind: 'share', value: record })}><Share2 size={15} />{record.sharedTo.length ? '已分享' : '分享'}</button>}</div></article>)}</div>
              {!records.some(record => record.date === selected) && <Empty icon={<Sparkles size={30} />} title='这一天，还留着空白' text='保存喜欢的名字后，就能在这里回看。' />}<div className='calendar-privacy'>名字与待办独立，分享只展示名称和日期。</div></section></div>
        </>}
      </main>
    </div>
    {showDue && <Modal title='小事提醒' subtitle='页面打开时可查看到期任务。' onClose={() => setShowDue(false)}><p className='info-note'>{notifications}</p><button className='button secondary' onClick={async () => {
      if (typeof Notification === 'undefined') { setNotifications('当前浏览器不支持系统通知，可使用应用内到期提示'); return; }
      try { const permission = await Notification.requestPermission(); setNotifications(permission === 'granted' ? '页面打开时已启用浏览器提醒' : '提醒未启用，请在浏览器设置中允许通知'); setClock(Date.now()); } catch { setNotifications('提醒未启用，请检查浏览器通知设置'); }
    }}>启用浏览器提醒</button><div className='online-due-list'>{due.map(task => <button key={task.id} onClick={() => { setShowDue(false); setEditor({ kind: 'task', value: task }); }}><strong>{task.title}</strong><span>{localTime(task.due).replace('T', ' ')}</span></button>)}{!due.length && <p>暂时没有到期的待办。</p>}</div></Modal>}
    {editor && <Modal title={editor.kind === 'task' ? editor.value.version ? '看看这件小事' : '记下一件小事' : editor.kind === 'list' ? '给小事一个新家' : editor.kind === 'library' ? '管理灵感词库' : editor.kind === 'share' ? '把好名字分享给伙伴' : editor.kind === 'members' ? editor.value.name : '和伙伴一起完成小事'} onClose={closeEditor} wide={editor.kind === 'library'}>
      {error && <div className='online-error' role='alert'>{error}<div className='online-error-actions'><button className='button secondary' disabled={busy} onClick={() => void refresh()}>刷新数据</button>{conflict && <button className='button secondary' disabled={busy || recoveryPending} onClick={() => void reloadDraft()}>载入最新内容</button>}</div></div>}
      <fieldset className='online-fieldset' disabled={busy || recoveryPending}>
        {editor.kind === 'task' && <TaskForm key={editorKey} task={editor.value} data={data} run={run} close={closeEditor} />}
        {editor.kind === 'list' && <ListForm key={editorKey} list={editor.value} run={run} close={closeEditor} />}
        {editor.kind === 'library' && <LibraryForm key={editorKey} library={editor.value} run={run} close={closeEditor} onSaved={savedMode => { setLibraryId(editor.value.id); setMode(savedMode); setEditor(null); }} />}
        {editor.kind === 'share' && <ShareForm key={editorKey} record={editor.value} lists={shared} run={run} close={closeEditor} />}
        {editor.kind === 'members' && <Members key={editorKey} list={data.lists.find(list => list.id === editor.value.id) || editor.value} data={data} run={run} close={closeEditor} />}
        {editor.kind === 'join' && <JoinForm session={session} run={run} close={closeEditor} />}
      </fieldset>
    </Modal>}
  </div></PeopleContext.Provider>;
}

function relevant(task: OnlineTask, data: Snapshot) {
  return task.assignee === data.user || (!task.assignee && data.lists.some(list => list.id === task.listId && list.members.length === 1));
}
function taskBody(task: OnlineTask) {
  return { title: task.title.trim(), note: task.note.trim(), assignee: task.assignee, due: task.due, done: task.done, version: task.version };
}

function AuthForm({ initialAddress, onSubmit, onDemo, onLogout, notice }: { initialAddress: string; onSubmit: (address: string, username: string, password: string, name?: string) => Promise<void>; onDemo?: () => void; onLogout?: () => Promise<void>; notice: string }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError('');
    try { await onSubmit(String(form.get('address')), String(form.get('username')), String(form.get('password')), register ? String(form.get('name')) : undefined); }
    catch (reason) { setError(message(reason)); } finally { setBusy(false); }
  };
  return <div className='online-auth'><section className='online-auth-intro'><span className='brand-mark'><Leaf size={38} /></span><p className='eyebrow'>SHIRI · 拾日</p><h1>小事慢慢做，<br />日子慢慢过。</h1><p>和熟悉的人一起完成日常的小事，<br />也为偶然遇见的好名字，留一个位置。</p><div className='online-auth-art'>✧<span>🌱</span>✦</div></section><section className='card online-auth-card'><div className='eyebrow'>WELCOME TO SHIRI</div><h2>{register ? '创建你的小天地' : '回到你的小天地'}</h2><p>待办与灵感，都在这里等你。</p>{notice && <p className='info-note' role='status'>{notice}</p>}<form className='form-layout' onSubmit={event => void submit(event)}><fieldset disabled={busy} className='online-fieldset'>
    <label>用户名<input name='username' autoComplete='username' required minLength={3} maxLength={30} pattern='[a-zA-Z0-9_]{3,30}' placeholder='3–30 位字母、数字或下划线' /></label>
    {register && <label>昵称<input name='name' autoComplete='nickname' required maxLength={30} placeholder='伙伴们如何称呼你' /></label>}
    <label>密码<input name='password' type='password' autoComplete={register ? 'new-password' : 'current-password'} required minLength={8} maxLength={128} placeholder='至少 8 个字符' /></label>
    <details className='online-service' open={!!initialAddress || location.protocol === 'file:'}><summary>连接设置</summary><label>服务地址<input name='address' defaultValue={initialAddress} placeholder={location.protocol === 'file:' ? 'http://电脑地址:3000' : '留空，使用当前站点'} /></label><p>本地开发由网页服务连接后端；其他设备填写可访问的服务地址。</p></details>
    {error && <p className='form-error' role='alert'>{error}</p>}<button className='button primary' type='submit'>{busy ? '正在连接…' : register ? '注册并进入' : '登录'}</button>
    </fieldset></form><div className='online-auth-links'>{!onLogout && <button className='text-button' disabled={busy} onClick={() => { setRegister(!register); setError(''); }}>{register ? '已有账号，去登录' : '还没有账号？注册'}</button>}{onDemo && <button className='text-button' disabled={busy} onClick={onDemo}>先体验本地演示</button>}{onLogout && <button className='text-button' disabled={busy} onClick={() => void onLogout()}>退出当前账号</button>}</div></section></div>;
}

function TaskForm({ task, data, run, close }: { task: OnlineTask; data: Snapshot; run: Run; close: () => void }) {
  const [listId, setListId] = useState(task.listId);
  const [assignee, setAssignee] = useState(task.assignee);
  const [error, setError] = useState('');
  const list = data.lists.find(item => item.id === listId);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setError('');
    try {
      const body = taskBody({ ...task, title: String(form.get('title')), note: String(form.get('note')), assignee, due: utcTime(String(form.get('due'))) });
      if (task.version) void run('PATCH', `/tasks/${task.id}`, body);
      else { const { done: _done, version: _version, ...input } = body; void run('POST', `/lists/${listId}/tasks`, { ...input, id: task.id }, undefined, { kind: 'tasks', id: task.id }); }
    } catch (reason) { setError(message(reason)); }
  };
  return <form className='form-layout' onSubmit={submit}><label>待办名称<input autoFocus name='title' required maxLength={100} defaultValue={task.title} /></label><label>备注<textarea name='note' rows={3} maxLength={2000} defaultValue={task.note} /></label><label>所属清单<select aria-label='所属清单' required value={listId} disabled={!!task.version} onChange={event => { setListId(event.target.value); if (!data.lists.find(item => item.id === event.target.value)?.members.includes(assignee)) setAssignee(''); }}>{data.lists.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className='form-two-columns'><label>交给谁<select aria-label='任务负责人' value={assignee} onChange={event => setAssignee(event.target.value)}><option value=''>暂不分配</option>{data.people.filter(person => list?.members.includes(person.id) || person.id === task.assignee).map(person => <option key={person.id} value={person.id}>{person.name}{!list?.members.includes(person.id) ? '（已退出）' : ''}</option>)}</select></label><label>截止时间<input name='due' type='datetime-local' defaultValue={localTime(task.due)} /></label></div>{error && <p className='form-error' role='alert'>{error}</p>}{!data.lists.length && <p className='info-note'>请先创建一份清单。</p>}<FormFooter close={close} label={task.version ? '保存修改' : '记下这件事'} disabled={!list} /></form>;
}
function FormFooter({ close, label, disabled = false }: { close: () => void; label: string; disabled?: boolean }) {
  return <div className='modal-footer'><button type='button' className='button secondary' onClick={close}>取消</button><button type='submit' className='button primary' disabled={disabled}>{label}</button></div>;
}
function ListForm({ list, run, close }: { list: OnlineList; run: Run; close: () => void }) {
  return <form className='form-layout' onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get('name')).trim(); if (!name) return; void run(list.version ? 'PATCH' : 'POST', list.version ? `/lists/${list.id}` : '/lists', { name, ...(list.version ? versionBody(list) : { id: list.id }) }, undefined, list.version ? undefined : { kind: 'lists', id: list.id }); }}><label>清单名称<input autoFocus name='name' required maxLength={30} defaultValue={list.name} /></label><p className='info-note'>创建个人清单，邀请伙伴加入后即可共同维护。</p><FormFooter close={close} label={list.version ? '保存清单名称' : '创建清单'} /></form>;
}
function LibraryForm({ library, run, close, onSaved }: { library: OnlineLibrary; run: Run; close: () => void; onSaved: (mode: 'full' | 'combine') => void }) {
  const [mode, setMode] = useState(library.mode);
  const [slots, setSlots] = useState(library.slots.map(slot => slot.join('\n')));
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  async function importText(file: File | undefined, index: number) {
    if (!file) return; setError(''); setReading(true);
    try {
      if (file.size > 1024 * 1024) throw new Error('请选择不超过 1 MB 的 UTF-8 TXT 文件');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); cleanWords(text);
      setSlots(current => current.map((value, i) => i === index ? text : value));
    } catch (reason) { setError(reason instanceof TypeError ? '文件不是有效的 UTF-8 文本' : message(reason)); }
    finally { setReading(false); }
  }
  return <form className='form-layout' onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setError('');
    try {
      const data = { name: String(form.get('name')).trim(), mode, slots: (mode === 'full' ? slots.slice(0, 1) : slots).map(cleanWords) };
      const done = () => { onSaved(mode); close(); };
      void run(library.version ? 'PUT' : 'POST', library.version ? `/libraries/${library.id}` : '/libraries', library.version ? { version: library.version, data } : { ...data, id: library.id }, done, library.version ? undefined : { kind: 'libraries', id: library.id });
    } catch (reason) { setError(message(reason)); }
  }}><fieldset disabled={reading} className='online-fieldset'><div className='form-two-columns'><label>词库名称<input autoFocus name='name' required maxLength={30} defaultValue={library.name} /></label><label>生成方式<select aria-label='生成方式' value={mode} onChange={event => { const next = event.target.value as typeof mode; setMode(next); if (next === 'combine' && slots.length < 2) setSlots([...slots, '']); }}><option value='full'>完整名称抽取</option><option value='combine'>有序词组组合</option></select></label></div><p className='info-note'>每行一个候选，自动去除空行与重复项。每组最多 10000 项，每项最多 300 字符。</p><div className={`slot-editors ${mode === 'full' ? 'single' : ''}`}>{(mode === 'full' ? slots.slice(0, 1) : slots).map((text, index) => <label key={index}>词组 {index + 1}<textarea required rows={7} value={text} aria-label={`词组 ${index + 1}`} onChange={event => setSlots(current => current.map((value, i) => i === index ? event.target.value : value))} /><span className='import-file'>导入 UTF-8 TXT<input type='file' accept='.txt,text/plain' aria-label={`导入词组${index + 1}`} onChange={event => { void importText(event.target.files?.[0], index); event.target.value = ''; }} /></span></label>)}</div>{mode === 'combine' && <button type='button' className='text-button' onClick={() => setSlots(slots.length === 3 ? slots.slice(0, 2) : [...slots, ''])}>{slots.length === 3 ? '移除第三个词组' : '添加第三个词组'}</button>}{error && <p className='form-error' role='alert'>{error}</p>}<FormFooter close={close} label={reading ? '读取中…' : '保存词库'} /></fieldset></form>;
}
function ShareForm({ record, lists, run, close }: { record: OnlineRecord; lists: OnlineList[]; run: Run; close: () => void }) {
  const [selected, setSelected] = useState(record.sharedTo.filter(id => lists.some(list => list.id === id)));
  return <form onSubmit={event => { event.preventDefault(); void run('PATCH', `/records/${record.id}/shares`, { version: record.version, listIds: selected }); }}><div className='share-snapshot'><Sparkles size={24} /><strong>{record.name}</strong><span>{record.date}</span></div><div className='share-choices'>{lists.map(list => <label key={list.id}><span>{list.name}<small>{list.members.length} 位成员</small></span><input type='checkbox' checked={selected.includes(list.id)} onChange={event => setSelected(current => event.target.checked ? [...current, list.id] : current.filter(id => id !== list.id))} /></label>)}</div>{!lists.length && <p className='info-note'>还没有共享清单；也可以保存空的分享设置，撤回现有分享。</p>}<FormFooter close={close} label='保存分享设置' /></form>;
}
function Members({ list, data, run, close }: { list: OnlineList; data: Snapshot; run: Run; close: () => void }) {
  const [invite, setInvite] = useState('');
  const [name, setName] = useState(list.name);
  const [error, setError] = useState('');
  const owner = list.owner === data.user;
  const confirmed = (prompt: string, method: string, path: string, body: object) => { if (window.confirm(prompt)) void run(method, path, body); };
  return <div className='form-layout'>{owner && <form className='online-list-name' onSubmit={event => { event.preventDefault(); void run('PATCH', `/lists/${list.id}`, { name: name.trim(), version: list.version }, () => undefined); }}><label>清单名称<input required maxLength={30} value={name} onChange={event => setName(event.target.value)} /></label><button type='submit' className='button secondary'>保存清单名称</button></form>}<div className='members-list'>{list.members.map(id => <div className='member-row' key={id}><Avatar id={id} /><div><strong>{data.people.find(person => person.id === id)?.name}</strong><small>{id === list.owner ? '清单所有者' : '清单成员'}</small></div>{owner && id !== data.user && <><button className='text-button' onClick={() => confirmed('转让后对方将成为清单所有者，确认转让？', 'POST', `/lists/${list.id}/transfer`, { version: list.version, userId: id })}>转让</button><button className='text-button danger-text' aria-label={`移除${data.people.find(person => person.id === id)?.name}`} onClick={() => confirmed('移除成员后，其未完成任务会改为未分配，确认移除？', 'DELETE', `/lists/${list.id}/members/${id}`, versionBody(list))}>移除</button></>}</div>)}</div>
    {owner && <div className='invite-box'><h3>邀请伙伴</h3><p>邀请码有效期为七天，原码仅在本次生成时显示。</p>{invite && <div className='invite-code'><code>{invite}</code><button type='button' className='button secondary' onClick={() => { void navigator.clipboard.writeText(invite).catch(() => setError('复制失败，请手动复制邀请码')); }}>复制</button></div>}{list.inviteExpires > Date.now() && <p>有效期至 {new Date(list.inviteExpires).toLocaleString('zh-CN')}</p>}<button className='button primary' onClick={() => void run('POST', `/lists/${list.id}/invitation`, versionBody(list), result => setInvite(result.code || ''))}>{list.inviteExpires > Date.now() ? '重新生成邀请码' : '生成邀请码'}</button>
    {(invite || list.inviteExpires > Date.now()) && <button className='button secondary' onClick={() => void run('DELETE', `/lists/${list.id}/invitation`, versionBody(list), () => setInvite(''))}>撤销邀请</button>}{error && <p role='alert'>{error}</p>}</div>}
    <div className='modal-footer'>{owner ? <button className='button danger-button' onClick={() => confirmed('删除整个清单及其中的任务？个人名字历史会保留。', 'DELETE', `/lists/${list.id}`, versionBody(list))}>删除清单</button> : <button className='button danger-button' onClick={() => confirmed('退出清单后，你未完成的任务会改为未分配。确认退出？', 'DELETE', `/lists/${list.id}/members/${data.user}`, versionBody(list))}>退出清单</button>}<button className='button secondary' onClick={close}>完成</button></div></div>;
}
function JoinForm({ session, run, close }: { session: Session; run: Run; close: () => void }) {
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<{ id: string; name: string; memberCount: number; alreadyJoined: boolean } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <form className='form-layout' onSubmit={async event => { event.preventDefault(); setError(''); setBusy(true); try { const result = await request<NonNullable<typeof preview>>(session.baseUrl, session.token, 'GET', `/invitations/${encodeURIComponent(code.trim().toUpperCase())}`); setPreview(result); } catch (reason) { setError(message(reason)); } finally { setBusy(false); } }}><fieldset disabled={busy} className='online-fieldset'><label>邀请码<input autoFocus required value={code} onChange={event => { setCode(event.target.value); setPreview(null); setError(''); }} /></label>{preview && <div className='join-preview'><div><h3>{preview.name}</h3><p>{preview.memberCount} 位成员{preview.alreadyJoined && ' · 你已加入'}</p></div></div>}{error && <p className='form-error' role='alert'>{error}</p>}<div className='modal-footer'><button type='button' className='button secondary' onClick={close}>取消</button>{preview && !preview.alreadyJoined ? <button type='button' className='button primary' onClick={() => void run('POST', `/invitations/${encodeURIComponent(code.trim().toUpperCase())}/join`, undefined)}>确认加入</button> : <button type='submit' className='button primary'>查找邀请</button>}</div></fieldset></form>;
}
