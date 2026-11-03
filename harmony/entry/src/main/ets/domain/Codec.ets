import { AppState, Library, NameRecord, Person, Task, TaskList, validDateKey, validUtc } from './Models';

function check(condition: boolean): void {
  if (!condition) throw new Error('本地数据格式不兼容或已损坏，已保留原数据。请勿清除应用数据。');
}

function text(value: string): boolean { return typeof value === 'string'; }
function strings(values: string[]): boolean {
  return Array.isArray(values) && values.every((value: string) => text(value));
}
function unique(values: string[]): boolean {
  const seen = new Set<string>();
  return values.every((value: string) => {
    if (value.length === 0 || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
function object(value: Object): boolean { return typeof value === 'object' && value !== null; }

export function decode(raw: string): AppState {
  const state = JSON.parse(raw) as AppState;
  check(object(state) && state.schema === 1 && text(state.user));
  check(Array.isArray(state.people) && Array.isArray(state.lists) && Array.isArray(state.tasks) &&
    Array.isArray(state.libraries) && Array.isArray(state.records));
  state.people.forEach((person: Person) => check(object(person) && text(person.id) && text(person.name)));
  const people = state.people.map((person: Person) => person.id);
  check(unique(people) && people.includes(state.user));
  state.lists.forEach((list: TaskList) => {
    check(object(list) && text(list.id) && text(list.name) && text(list.owner) && strings(list.members));
    check(unique(list.members) && list.members.includes(list.owner) && list.members.every((id: string) => people.includes(id)));
    check(text(list.invite) && Number.isFinite(list.inviteExpires) && list.inviteExpires >= 0);
  });
  const lists = state.lists.map((list: TaskList) => list.id);
  check(unique(lists));
  state.tasks.forEach((task: Task) => {
    check(object(task) && text(task.id) && text(task.listId) && text(task.title) && text(task.note) && text(task.assignee));
    check(text(task.due) && (task.due === '' || validUtc(task.due)) && typeof task.done === 'boolean' &&
      Number.isFinite(task.created) && Number.isInteger(task.version) && task.version > 0);
    const list = state.lists.find((item: TaskList) => item.id === task.listId);
    check(list !== undefined && (task.assignee === '' || (task.done ? people.includes(task.assignee) : list.members.includes(task.assignee))));
  });
  check(unique(state.tasks.map((task: Task) => task.id)));
  state.libraries.forEach((library: Library) => {
    check(object(library) && text(library.id) && text(library.name) && people.includes(library.owner));
    check((library.mode === 'full' || library.mode === 'combine') && Array.isArray(library.slots));
    check(library.mode === 'full' ? library.slots.length === 1 : library.slots.length === 2 || library.slots.length === 3);
    library.slots.forEach((slot: string[]) => check(strings(slot) && slot.length > 0 && unique(slot)));
  });
  check(unique(state.libraries.map((library: Library) => library.id)));
  state.records.forEach((record: NameRecord) => {
    check(object(record) && text(record.id) && text(record.name) && text(record.source) && people.includes(record.owner));
    check(record.mode === 'full' || record.mode === 'combine');
    check(text(record.date) && validDateKey(record.date));
    check(text(record.savedAt) && validUtc(record.savedAt));
    check(strings(record.sharedTo) && unique(record.sharedTo) && record.sharedTo.every((id: string) => lists.includes(id)));
  });
  check(unique(state.records.map((record: NameRecord) => record.id)));
  return state;
}

export function copy(state: AppState): AppState {
  return decode(JSON.stringify(state));
}
