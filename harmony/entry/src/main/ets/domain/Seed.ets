import { AppState, Library, NameRecord, Person, Task, TaskList, dateKey } from './Models';

export function seed(now: Date = new Date()): AppState {
  const state = new AppState();
  const today = dateKey(now);
  state.people = [new Person('lin', '林小满'), new Person('chen', '陈一舟'), new Person('xu', '许知夏')];
  state.lists = [
    new TaskList('personal', '生活的小事', 'lin', ['lin']),
    new TaskList('weekend', '周末一起走走', 'lin', ['lin', 'chen', 'xu']),
    new TaskList('chen-personal', '一舟的日常', 'chen', ['chen'])
  ];
  state.tasks = [
    new Task('t1', 'personal', '给阳台的植物浇浇水', '薄荷和龟背竹都要照顾到。', 'lin', new Date(`${today}T09:00`).toISOString(), now.getTime()),
    new Task('t2', 'weekend', '一起选一条周末的徒步路线', '想找一条有溪水的轻松路线。', 'lin', new Date(`${today}T20:00`).toISOString(), now.getTime() + 1),
    new Task('t3', 'personal', '读完《山茶文具店》', '留半小时给自己，泡一杯热茶。', '', '', now.getTime() + 2),
    new Task('t4', 'weekend', '准备野餐垫和手冲咖啡', '', 'chen', '', now.getTime() + 3),
    new Task('t5', 'chen-personal', '把新买的书放上书架', '', 'chen', '', now.getTime() + 4)
  ];
  state.libraries = [
    new Library('forest', '森林来信', 'combine', [['慢慢的', '听雨的', '追风的', '晒太阳的'], ['小水獭', '小狐狸', '云朵', '小鹿']], 'lin'),
    new Library('universe', '温柔宇宙', 'full', [['山间来信', '月亮邮差', '晚风收藏家', '橘子汽水']], 'lin'),
    new Library('sea', '一舟的灵感', 'full', [['海盐汽水', '山野旅人']], 'chen')
  ];
  state.records = [new NameRecord('n1', '慢慢的小水獭', 'combine', '森林来信', today, now.toISOString(), 'lin')];
  const shared = new NameRecord('n2', '海盐汽水', 'full', '一舟的灵感', today, now.toISOString(), 'chen');
  shared.sharedTo = ['weekend'];
  state.records.push(shared);
  return state;
}
