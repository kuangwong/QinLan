export type NameMode = 'full' | 'combine';
export type TaskFilter = 'pending' | 'done' | 'all';

export class Person {
  id: string;
  name: string;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }
}

export class TaskList {
  version: number = 1;
  invite: string = '';
  inviteExpires: number = 0;
  id: string;
  name: string;
  owner: string;
  members: string[];

  constructor(id: string, name: string, owner: string, members: string[]) {
    this.id = id;
    this.name = name;
    this.owner = owner;
    this.members = members;
  }
}

export class Task {
  done: boolean = false;
  version: number = 1;
  id: string;
  listId: string;
  title: string;
  note: string;
  assignee: string;
  due: string;
  created: number;

  constructor(id: string, listId: string, title: string, note: string,
    assignee: string, due: string, created: number) {
    this.id = id;
    this.listId = listId;
    this.title = title;
    this.note = note;
    this.assignee = assignee;
    this.due = due;
    this.created = created;
  }
}

export class Library {
  version: number = 1;
  id: string;
  name: string;
  mode: NameMode;
  slots: string[][];
  owner: string;

  constructor(id: string, name: string, mode: NameMode,
    slots: string[][], owner: string) {
    this.id = id;
    this.name = name;
    this.mode = mode;
    this.slots = slots;
    this.owner = owner;
  }
}

export class NameRecord {
  version: number = 1;
  sharedTo: string[] = [];
  id: string;
  name: string;
  mode: NameMode;
  source: string;
  date: string;
  savedAt: string;
  owner: string;

  constructor(id: string, name: string, mode: NameMode, source: string,
    date: string, savedAt: string, owner: string) {
    this.id = id;
    this.name = name;
    this.mode = mode;
    this.source = source;
    this.date = date;
    this.savedAt = savedAt;
    this.owner = owner;
  }
}

export class GeneratedName {
  name: string;
  mode: NameMode;
  source: string;

  constructor(name: string, mode: NameMode, source: string) {
    this.name = name;
    this.mode = mode;
    this.source = source;
  }
}

export class AppState {
  schema: number = 1;
  user: string = 'lin';
  people: Person[] = [];
  lists: TaskList[] = [];
  tasks: Task[] = [];
  libraries: Library[] = [];
  records: NameRecord[] = [];
}

export class CalendarDay {
  key: string;
  day: number;
  inMonth: boolean;

  constructor(key: string, day: number, inMonth: boolean) {
    this.key = key;
    this.day = day;
    this.inMonth = inMonth;
  }
}

export function dateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function calendarDays(year: number, month: number): CalendarDay[] {
  const first = new Date(year, month, 1);
  // Monday is the first column, including when a month starts on Sunday.
  const offset = (first.getDay() + 6) % 7;
  const cells: CalendarDay[] = [];
  for (let i = 0; i < 42; i++) {
    const day = new Date(year, month, i - offset + 1);
    cells.push(new CalendarDay(dateKey(day), day.getDate(), day.getMonth() === month));
  }
  return cells;
}

export function cleanWords(text: string): string[] {
  const words: string[] = [];
  const seen = new Set<string>();
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((line: string) => {
    const value = line.trim();
    if (value.length > 0 && !seen.has(value)) {
      seen.add(value);
      words.push(value);
    }
  });
  return words;
}

function utf8Bytes(text: string): number {
  let size = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x80) size++;
    else if (code < 0x800) size += 2;
    else if (code >= 0xD800 && code <= 0xDBFF && index + 1 < text.length &&
      text.charCodeAt(index + 1) >= 0xDC00 && text.charCodeAt(index + 1) <= 0xDFFF) {
      size += 4; index++;
    } else size += 3;
  }
  return size;
}

export function librarySlots(mode: NameMode, texts: string[]): string[][] {
  if (mode !== 'full' && mode !== 'combine') throw new Error('生成模式无效');
  if (mode === 'full' ? texts.length !== 1 : texts.length < 2 || texts.length > 3) {
    throw new Error('完整名称需要一个候选组，组合模式需要 2–3 个词组');
  }
  if (texts.some((text: string) => utf8Bytes(text) > 1024 * 1024)) throw new Error('每个词组最多 1 MB UTF-8 文本');
  const slots = texts.map((text: string) => cleanWords(text));
  slots.forEach((slot: string[], index: number) => {
    if (slot.length === 0) throw new Error(`词组 ${index + 1} 至少需要一个非空候选词`);
    if (slot.length > 2000) throw new Error(`词组 ${index + 1} 最多 2000 个候选词`);
    if (slot.some((word: string) => word.length > 100)) throw new Error(`词组 ${index + 1} 每个候选词最多 100 个字符`);
  });
  return slots;
}

export function validDue(value: string): boolean {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && `${dateKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` === value;
}

export function localDue(value: string): string {
  if (value === '') return '';
  const date = new Date(value);
  return `${dateKey(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function validUtc(value: string): boolean {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

export function validDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
