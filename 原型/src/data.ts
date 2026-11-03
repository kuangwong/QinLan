export type Person = { id: string; name: string; color: string };
export type List = { id: string; name: string; emoji: string; color: string; members: string[]; owner: string; invite?: string; inviteExpires?: number };
export type Task = { id: string; title: string; note: string; listId: string; assignee: string; due: string; done: boolean; created: number };
export type Library = { id: string; name: string; mode: 'full' | 'combine'; slots: string[][]; owner: string };
export type NameRecord = { id: string; name: string; mode: 'full' | 'combine'; source: string; date: string; savedAt: string; owner: string; sharedTo: string[] };
export type Data = { tasks: Task[]; lists: List[]; libraries: Library[]; records: NameRecord[]; user: string };

export const people: Person[] = [
  { id: 'lin', name: '林小满', color: 'sage' },
  { id: 'chen', name: '陈一舟', color: 'peach' },
  { id: 'xu', name: '许知夏', color: 'lavender' },
];
export const uid = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('');
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function relativeDay(offset: number) {
  const day = new Date(); day.setDate(day.getDate() + offset); return dateKey(day);
}
export const today = dateKey();
export function seed(): Data {
  return {
    user: 'lin',
    lists: [
      { id: 'personal', name: '生活的小事', emoji: '☕', color: 'sage', members: ['lin'], owner: 'lin' },
      { id: 'weekend', name: '周末出逃计划', emoji: '⛺', color: 'peach', members: ['lin', 'chen', 'xu'], owner: 'lin' },
      { id: 'home', name: '我们的小家', emoji: '🏡', color: 'lavender', members: ['lin', 'chen'], owner: 'chen' },
      { id: 'chen-personal', name: '一舟的日常', emoji: '📚', color: 'sky', members: ['chen'], owner: 'chen' },
    ],
    tasks: [
      { id: 't1', title: '给阳台的植物浇浇水', note: '薄荷和龟背竹都要照顾到，最近天气有点干。', listId: 'personal', assignee: 'lin', due: `${today}T09:00`, done: false, created: 1 },
      { id: 't2', title: '一起选一条周末的徒步路线', note: '想找一条轻松一点的路线，有溪水就更好啦。', listId: 'weekend', assignee: 'lin', due: `${today}T20:00`, done: false, created: 2 },
      { id: 't3', title: '补充冰箱里的水果和牛奶', note: '牛奶两瓶、香蕉、蓝莓，还有小番茄。', listId: 'home', assignee: 'lin', due: `${today}T18:30`, done: false, created: 3 },
      { id: 't4', title: '读完《山茶文具店》的最后一章', note: '留半小时给自己，泡一杯热茶。', listId: 'personal', assignee: 'lin', due: `${relativeDay(1)}T21:00`, done: false, created: 4 },
      { id: 't5', title: '准备野餐垫和手冲咖啡', note: '', listId: 'weekend', assignee: 'chen', due: `${relativeDay(2)}T10:00`, done: false, created: 5 },
      { id: 't6', title: '整理上周旅行的照片', note: '挑几张喜欢的洗出来。', listId: 'personal', assignee: 'lin', due: `${relativeDay(3)}T19:00`, done: false, created: 6 },
      { id: 't7', title: '给自己订一束当季的鲜花', note: '', listId: 'personal', assignee: 'lin', due: `${today}T08:00`, done: true, created: 7 },
      { id: 't8', title: '确认周末出发的时间', note: '', listId: 'weekend', assignee: 'xu', due: `${today}T12:00`, done: true, created: 8 },
      { id: 't9', title: '把新买的书放上书架', note: '', listId: 'chen-personal', assignee: 'chen', due: `${today}T20:00`, done: false, created: 9 },
    ],
    libraries: [
      { id: 'lib1', name: '森林来信', mode: 'combine', slots: [['慢慢的', '打盹的', '追风的', '软绵绵的', '听雨的', '散步的', '发呆的', '晒太阳的'], ['小水獭', '小狐狸', '云朵', '橘子', '小熊', '蘑菇', '小鹿', '小海獭']], owner: 'lin' },
      { id: 'lib2', name: '温柔宇宙', mode: 'full', slots: [['山间来信', '月亮邮差', '晚风收藏家', '银河便利店', '橘子汽水', '云边小憩', '日落放映室', '春日漫游', '一颗小星球', '风里的诗']], owner: 'lin' },
      { id: 'lib3', name: '一舟的灵感', mode: 'full', slots: [['海盐汽水', '山野旅人', '落日飞车']], owner: 'chen' },
    ],
    records: [
      { id: 'n1', name: '慢慢的小水獭', mode: 'combine', source: '森林来信', date: today, savedAt: new Date().toISOString(), owner: 'lin', sharedTo: [] },
      { id: 'n2', name: '月亮邮差', mode: 'full', source: '温柔宇宙', date: relativeDay(-1), savedAt: new Date().toISOString(), owner: 'lin', sharedTo: ['weekend'] },
      { id: 'n3', name: '听雨的小狐狸', mode: 'combine', source: '森林来信', date: relativeDay(-3), savedAt: new Date().toISOString(), owner: 'lin', sharedTo: [] },
      { id: 'n4', name: '山间来信', mode: 'full', source: '温柔宇宙', date: relativeDay(-5), savedAt: new Date().toISOString(), owner: 'lin', sharedTo: [] },
      { id: 'n5', name: '海盐汽水', mode: 'full', source: '一舟的灵感', date: today, savedAt: new Date().toISOString(), owner: 'chen', sharedTo: ['weekend'] },
    ],
  };
}

export const storageKey = 'shiri-prototype-v1';
export function loadData(): Data {
  try { const raw = localStorage.getItem(storageKey); if (raw) return JSON.parse(raw); } catch { /* Use fresh examples if storage is unavailable. */ }
  return seed();
}
export function dueText(due: string) {
  if (!due) return '未设截止时间';
  const day = due.slice(0, 10);
  const label = day === today ? '今天' : day === relativeDay(1) ? '明天' : `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`;
  return `${label} ${due.slice(11, 16)}`;
}
