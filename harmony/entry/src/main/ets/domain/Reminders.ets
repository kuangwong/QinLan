import { AppState, Task } from './Models';
import { Rules } from './Rules';

export class DesiredReminder {
  notificationId: number;
  title: string;
  due: string;

  constructor(notificationId: number, title: string, due: string) {
    this.notificationId = notificationId; this.title = title; this.due = due;
  }
}

export class ScheduledReminder extends DesiredReminder {
  reminderId: number;
  constructor(reminderId: number, notificationId: number, title: string, due: string) {
    super(notificationId, title, due); this.reminderId = reminderId;
  }
}

export interface ReminderPort {
  current(): Promise<ScheduledReminder[]>;
  publish(reminder: DesiredReminder): Promise<void>;
  cancel(id: number): Promise<void>;
}

export function desiredReminders(state: AppState, now: number): DesiredReminder[] {
  const tasks = Rules.tasks(state, 'mine', 'pending').filter((task: Task) => task.due !== '' && new Date(task.due).getTime() > now);
  const ids: number[] = [];
  return tasks.map((task: Task) => {
    const key = `${state.user}:${task.id}`;
    let id = 1;
    for (let i = 0; i < key.length; i++) id = (id * 31 + key.charCodeAt(i)) % 2147483647;
    if (ids.includes(id)) throw new Error('提醒编号冲突，部分提醒尚未更新');
    ids.push(id);
    // The platform calendar API stores whole seconds. Round upwards so a
    // deadline imported with milliseconds is never scheduled prematurely.
    const due = new Date(Math.ceil(new Date(task.due).getTime() / 1000) * 1000).toISOString();
    return new DesiredReminder(id, task.title, due);
  });
}

// Query system state on every reconciliation; a crash between publish and local
// persistence cannot orphan duplicate reminders. Already matching entries survive.
export async function reconcileReminders(port: ReminderPort, desired: DesiredReminder[], current: () => boolean = () => true): Promise<void> {
  const existing = await port.current();
  const kept: number[] = [];
  for (let i = 0; i < existing.length; i++) {
    if (!current()) return;
    const item = existing[i];
    const match = desired.find((value: DesiredReminder) => value.notificationId === item.notificationId &&
      value.title === item.title && value.due === item.due);
    if (match && !kept.includes(item.notificationId)) kept.push(item.notificationId);
    else await port.cancel(item.reminderId);
  }
  for (let i = 0; i < desired.length; i++) {
    if (!current()) return;
    if (!kept.includes(desired[i].notificationId)) await port.publish(desired[i]);
  }
}

// All callers await the same drain, including logout. A newer snapshot replaces
// queued work and supersedes errors from an older account or task version.
export class ReminderCoordinator {
  private port: ReminderPort;
  private enabled: () => Promise<boolean>;
  private clock: () => number;
  private pending: DesiredReminder[] | undefined = undefined;
  private running: Promise<string> | undefined = undefined;
  private revision: number = 0;

  constructor(port: ReminderPort, enabled: () => Promise<boolean>, clock: () => number = Date.now) {
    this.port = port; this.enabled = enabled; this.clock = clock;
  }

  sync(state: AppState): Promise<string> {
    try { this.pending = desiredReminders(state, this.clock()); }
    catch (error) { return Promise.reject(error as Error); }
    this.revision++;
    if (this.running === undefined) this.running = Promise.resolve().then(() => this.drain());
    return this.running;
  }

  private async drain(): Promise<string> {
    let status = '';
    try {
      while (this.pending !== undefined) {
        const requested = this.pending;
        const revision = this.revision;
        this.pending = undefined;
        try {
          let enabled = false;
          try { enabled = await this.enabled(); }
          catch (error) { if (requested.length > 0) throw error as Error; }
          const desired = enabled ? requested.filter((item: DesiredReminder) => new Date(item.due).getTime() > this.clock()) : [];
          await reconcileReminders(this.port, desired.slice(0, 30), () => this.revision === revision);
          status = !enabled ? '系统提醒未启用，请在个人页面授权' : desired.length > 30
            ? `已安排最近 30 项提醒，另 ${desired.length - 30} 项需下次打开应用时更新`
            : `系统提醒已安排 ${desired.length} 项`;
        } catch (error) {
          if (this.pending === undefined) throw error as Error;
        }
      }
      return status;
    } finally { this.running = undefined; }
  }
}
