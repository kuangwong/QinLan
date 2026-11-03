import { AppState, GeneratedName, Library, NameMode, NameRecord, Task, TaskFilter, TaskList,
  librarySlots, dateKey, validDue } from './Models';

function requireRule(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export class Rules {
  static member(state: AppState, listId: string): TaskList {
    const list = state.lists.find((item: TaskList) => item.id === listId);
    requireRule(list !== undefined && list.members.includes(state.user), '你已不在这份清单中，请刷新后重试');
    return list!;
  }

  static owner(state: AppState, listId: string): TaskList {
    const list = Rules.member(state, listId);
    requireRule(list.owner === state.user, '只有清单所有者可以进行此操作');
    return list;
  }

  static lists(state: AppState): TaskList[] {
    return state.lists.filter((list: TaskList) => list.members.includes(state.user));
  }

  static tasks(state: AppState, scope: string, filter: TaskFilter, query: string = '', assignee: string = 'all'): Task[] {
    const lists = Rules.lists(state);
    return state.tasks.filter((task: Task) => {
      const list = lists.find((item: TaskList) => item.id === task.listId);
      return list !== undefined && (scope === 'mine'
        ? task.assignee === state.user || (list.members.length === 1 && task.assignee === '')
        : task.listId === scope) && (filter === 'all' || task.done === (filter === 'done')) &&
        (assignee === 'all' || task.assignee === assignee) &&
        `${task.title} ${task.note}`.toLowerCase().includes(query.trim().toLowerCase());
    }).sort((a: Task, b: Task) => Number(a.done) - Number(b.done) ||
      (a.due || '9999').localeCompare(b.due || '9999') || a.created - b.created);
  }

  static saveTask(state: AppState, id: string, listId: string, title: string, note: string,
    assignee: string, due: string, now: number, expectedVersion: number = 0): void {
    const list = Rules.member(state, listId);
    requireRule(title.trim().length > 0 && title.trim().length <= 100, '标题需要 1–100 个字符');
    requireRule(note.length <= 2000, '备注最多 2000 个字符');
    requireRule(assignee === '' || list.members.includes(assignee), '负责人必须是当前清单成员');
    requireRule(validDue(due), '请输入有效的截止时间，例如 2026-11-03 18:30');
    const utcDue = due === '' ? '' : new Date(due).toISOString();
    const existing = state.tasks.find((task: Task) => task.id === id);
    if (existing) {
      Rules.member(state, existing.listId);
      requireRule(existing.listId === listId, '编辑时不能跨清单移动待办');
      requireRule(existing.version === expectedVersion, '待办已发生变化，请重新打开后编辑');
      existing.title = title.trim();
      existing.note = note.trim();
      existing.assignee = assignee;
      existing.due = utcDue;
      existing.version++;
    } else {
      requireRule(expectedVersion === 0, '待办已被删除，请刷新');
      state.tasks.push(new Task(id, listId, title.trim(), note.trim(), assignee, utcDue, now));
    }
  }

  static toggleTask(state: AppState, id: string, expectedVersion: number): void {
    const task = Rules.task(state, id, expectedVersion);
    task.done = !task.done;
    if (!task.done && task.assignee && !Rules.member(state, task.listId).members.includes(task.assignee)) task.assignee = '';
    task.version++;
  }

  static deleteTask(state: AppState, id: string, expectedVersion: number): void {
    Rules.task(state, id, expectedVersion);
    state.tasks = state.tasks.filter((task: Task) => task.id !== id);
  }

  private static task(state: AppState, id: string, version: number): Task {
    const task = state.tasks.find((item: Task) => item.id === id);
    requireRule(task !== undefined, '待办不存在');
    Rules.member(state, task!.listId);
    requireRule(task!.version === version, '待办已发生变化，请刷新后重试');
    return task!;
  }

  static createList(state: AppState, id: string, name: string): void {
    requireRule(name.trim().length > 0 && name.trim().length <= 30, '清单名称需要 1–30 个字符');
    requireRule(!state.lists.some((list: TaskList) => list.id === id), '清单已存在');
    state.lists.push(new TaskList(id, name.trim(), state.user, [state.user]));
  }

  static invite(state: AppState, listId: string, code: string, now: number): void {
    const list = Rules.owner(state, listId);
    requireRule(code.length > 0 && !state.lists.some((item: TaskList) => item.id !== listId && item.invite === code), '邀请码重复，请重试');
    list.invite = code;
    list.inviteExpires = now + 7 * 24 * 60 * 60 * 1000;
    list.version++;
  }

  static revokeInvite(state: AppState, listId: string): void {
    const list = Rules.owner(state, listId);
    list.invite = '';
    list.inviteExpires = 0;
    list.version++;
  }

  static findInvitation(state: AppState, code: string, now: number): TaskList {
    const list = state.lists.find((item: TaskList) => item.invite === code.trim().toUpperCase() && item.inviteExpires > now);
    requireRule(list !== undefined, '邀请码不存在、已撤销或已过期');
    requireRule(!list!.members.includes(state.user), '你已经在这份清单中');
    return list!;
  }

  static join(state: AppState, code: string, now: number): void {
    const list = Rules.findInvitation(state, code, now);
    list.members.push(state.user);
    list.version++;
  }

  static removeMember(state: AppState, listId: string, userId: string): void {
    const list = Rules.member(state, listId);
    requireRule(userId === state.user || list.owner === state.user, '只有所有者能移除其他成员');
    requireRule(userId !== list.owner, '所有者需要先转让所有权，或删除清单');
    requireRule(list.members.includes(userId), '成员已不在清单中');
    list.members = list.members.filter((id: string) => id !== userId);
    list.version++;
    state.tasks.forEach((task: Task) => {
      if (task.listId === listId && task.assignee === userId && !task.done) {
        task.assignee = '';
        task.version++;
      }
    });
  }

  static transfer(state: AppState, listId: string, userId: string): void {
    const list = Rules.owner(state, listId);
    requireRule(list.members.includes(userId) && userId !== state.user, '请选择另一位当前成员');
    list.owner = userId;
    list.invite = '';
    list.inviteExpires = 0;
    list.version++;
  }

  static deleteList(state: AppState, listId: string): void {
    Rules.owner(state, listId);
    state.lists = state.lists.filter((list: TaskList) => list.id !== listId);
    state.tasks = state.tasks.filter((task: Task) => task.listId !== listId);
    state.records.forEach((record: NameRecord) => {
      if (record.sharedTo.includes(listId)) record.version++;
      record.sharedTo = record.sharedTo.filter((id: string) => id !== listId);
    });
  }

  static saveLibrary(state: AppState, id: string, name: string, mode: NameMode, texts: string[]): void {
    requireRule(name.trim().length > 0 && name.trim().length <= 30, '词库名称需要 1–30 个字符');
    const slots = librarySlots(mode, texts);
    const existing = state.libraries.find((library: Library) => library.id === id);
    if (existing) {
      requireRule(existing.owner === state.user, '只能修改自己的词库');
      existing.name = name.trim(); existing.mode = mode; existing.slots = slots;
      existing.version++;
    } else {
      state.libraries.push(new Library(id, name.trim(), mode, slots, state.user));
    }
  }

  static deleteLibrary(state: AppState, id: string): void {
    const library = state.libraries.find((item: Library) => item.id === id);
    requireRule(library !== undefined && library.owner === state.user, '只能删除自己的词库');
    state.libraries = state.libraries.filter((item: Library) => item.id !== id);
  }

  static generate(state: AppState, id: string, random: () => number = Math.random): GeneratedName {
    const library = state.libraries.find((item: Library) => item.id === id && item.owner === state.user);
    requireRule(library !== undefined, '请先选择自己的词库');
    requireRule(library!.slots.every((slot: string[]) => slot.length > 0), '词库不能为空');
    const name = library!.slots.map((slot: string[]) => {
      const value = random();
      requireRule(value >= 0 && value < 1, '随机数不可用，请重试');
      return slot[Math.floor(value * slot.length)];
    }).join('');
    return new GeneratedName(name, library!.mode, library!.name);
  }

  static saveName(state: AppState, id: string, generated: GeneratedName, now: Date): void {
    requireRule(generated.name.trim().length > 0, '请先生成名字');
    requireRule(generated.name.length <= 900, '名字最多 900 个字符，请调整词库后重新生成');
    requireRule(!state.records.some((record: NameRecord) => record.id === id), '记录已保存');
    state.records.unshift(new NameRecord(id, generated.name, generated.mode, generated.source,
      dateKey(now), now.toISOString(), state.user));
  }

  static records(state: AppState, scope: string): NameRecord[] {
    if (scope === 'mine') return state.records.filter((record: NameRecord) => record.owner === state.user);
    const list = Rules.member(state, scope);
    return state.records.filter((record: NameRecord) => list.members.length > 1 && record.sharedTo.includes(scope));
  }

  static share(state: AppState, recordId: string, listIds: string[]): void {
    const record = Rules.ownRecord(state, recordId);
    listIds.forEach((id: string) => requireRule(Rules.member(state, id).members.length > 1, '只能分享到当前加入的共享清单'));
    record.sharedTo = listIds.filter((id: string, index: number) => listIds.indexOf(id) === index);
    record.version++;
  }

  private static ownRecord(state: AppState, id: string): NameRecord {
    const record = state.records.find((item: NameRecord) => item.id === id);
    requireRule(record !== undefined && record.owner === state.user, '只能修改自己的名字记录');
    return record!;
  }

  static deleteRecord(state: AppState, id: string): void {
    Rules.ownRecord(state, id);
    state.records = state.records.filter((record: NameRecord) => record.id !== id);
  }
}
