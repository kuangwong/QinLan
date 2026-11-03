import { common } from '@kit.AbilityKit';
import { reminderAgentManager } from '@kit.BackgroundTasksKit';
import { notificationManager } from '@kit.NotificationKit';
import { AppState } from '../domain/Models';
import { DesiredReminder, ScheduledReminder, ReminderPort, ReminderCoordinator } from '../domain/Reminders';

class SystemReminderPort implements ReminderPort {
  async current(): Promise<ScheduledReminder[]> {
    const reminders = await reminderAgentManager.getAllValidReminders();
    const result: ScheduledReminder[] = [];
    reminders.forEach((info: reminderAgentManager.ReminderInfo) => {
      const request = info.reminderReq;
      if (request.reminderType !== reminderAgentManager.ReminderType.REMINDER_TYPE_CALENDAR || request.title !== '拾日 · 待办到期') return;
      const calendar = request as reminderAgentManager.ReminderRequestCalendar;
      const time = calendar.dateTime;
      const due = new Date(time.year, time.month - 1, time.day, time.hour, time.minute, time.second || 0).toISOString();
      result.push(new ScheduledReminder(info.reminderId, request.notificationId || 0, request.content || '', due));
    });
    return result;
  }

  async publish(reminder: DesiredReminder): Promise<void> {
    const date = new Date(reminder.due);
    const request: reminderAgentManager.ReminderRequestCalendar = {
      reminderType: reminderAgentManager.ReminderType.REMINDER_TYPE_CALENDAR,
      dateTime: { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds() },
      title: '拾日 · 待办到期', content: reminder.title, expiredContent: '这件小事到时间了',
      notificationId: reminder.notificationId, ringDuration: 0,
      wantAgent: { pkgName: 'com.qinlan.shiri', abilityName: 'EntryAbility' },
      actionButton: [{ title: '关闭', type: reminderAgentManager.ActionButtonType.ACTION_BUTTON_TYPE_CLOSE }],
      slotType: notificationManager.SlotType.CONTENT_INFORMATION
    };
    await reminderAgentManager.publishReminder(request);
  }

  async cancel(id: number): Promise<void> { await reminderAgentManager.cancelReminder(id); }
}

export class SystemReminders {
  private coordinator: ReminderCoordinator = new ReminderCoordinator(new SystemReminderPort(),
    () => notificationManager.isNotificationEnabled());

  async enable(context: common.UIAbilityContext, state: AppState): Promise<string> {
    await notificationManager.requestEnableNotification(context);
    return this.sync(state);
  }

  sync(state: AppState): Promise<string> { return this.coordinator.sync(state); }
}
