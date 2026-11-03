import { common } from '@kit.AbilityKit';
import { util } from '@kit.ArkTS';
import { fileIo as fs, picker } from '@kit.CoreFileKit';
import { KeyboardAvoidMode, LengthMetrics } from '@kit.ArkUI';
import { AppState, GeneratedName, Library, NameMode, NameRecord, Person, Task, TaskFilter, TaskList, dateKey, localDue, validDue } from '../domain/Models';
import { LocalStore } from '../domain/LocalStore';
import { OnlineClient } from '../domain/OnlineClient';
import { RecoveryAction, recoveryAction } from '../domain/ApiFailure';
import { Rules } from '../domain/Rules';
import { FileStorage } from '../services/FileStorage';
import { SystemReminders } from '../services/SystemReminders';
import { HttpTransport } from '../services/HttpTransport';
import { AssetSessionVault } from '../services/AssetSessionVault';
import { MonthCalendar } from '../components/MonthCalendar';

@Entry
@Component
struct Index {
  @StorageLink('shiriForeground') @Watch('foregroundChanged') private foreground: boolean = true;
  @State private data: AppState = new AppState();
  @State private ready: boolean = false;
  @State private busy: boolean = false;
  @State private error: string = '';
  @State private notice: string = '';
  @State private tab: number = 0;
  @State private screen: string = '';
  @State private scope: string = 'mine';
  @State private filter: TaskFilter = 'pending';
  @State private query: string = '';
  @State private assigneeFilter: string = 'all';
  @State private calendarScope: string = 'mine';
  @State private year: number = new Date().getFullYear();
  @State private month: number = new Date().getMonth();
  @State private selectedDay: string = dateKey();
  @State private selectedLibrary: string = 'forest';
  @State private generated: GeneratedName = new GeneratedName('', 'combine', '');
  @State private generatedSaved: boolean = false;
  @State private editId: string = '';
  @State private editVersion: number = 0;
  @State private title: string = '';
  @State private note: string = '';
  @State private listId: string = '';
  @State private assignee: string = '';
  @State private due: string = '';
  @State private mode: NameMode = 'combine';
  @State private slotOne: string = '';
  @State private slotTwo: string = '';
  @State private slotThree: string = '';
  @State private thirdSlot: boolean = false;
  @State private manageListId: string = '';
  @State private inviteCode: string = '';
  @State private foundList: string = '';
  @State private shareRecordId: string = '';
  @State private shareIds: string[] = [];
  @State private reminderStatus: string = '正在检查系统提醒';
  @State private reminderCleanupNeeded: boolean = false;
  @State private online: boolean = false;
  @State private serverUrl: string = '';
  @State private username: string = '';
  @State private password: string = '';
  @State private accountName: string = '';
  @State private registerMode: boolean = false;
  @State private refreshRequired: boolean = false;
  @State private syncing: boolean = false;
  @State private shareVersion: number = 0;
  @State private recovery: RecoveryAction = '';
  private store: LocalStore | undefined = undefined;
  private reminders: SystemReminders = new SystemReminders();
  private client: OnlineClient | undefined = undefined;
  private pollTimer: number = -1;
  private creationListId: string = '';
  private generatedId: string = '';

  aboutToAppear(): void {
    this.getUIContext().setKeyboardAvoidMode(KeyboardAvoidMode.RESIZE);
    this.initialize();
  }
  aboutToDisappear(): void { this.stopPolling(); }
  onPageShow(): void {
    if (this.ready && this.online) { this.refreshOnline(); this.startPolling(); }
    else if (this.ready) this.refreshReminders();
  }
  onPageHide(): void { this.stopPolling(); }
  private foregroundChanged(): void {
    if (!this.foreground) { this.stopPolling(); return; }
    if (this.ready && this.online) { this.refreshOnline(); this.startPolling(); }
    else if (this.ready) this.refreshReminders();
  }
  onBackPress(): boolean {
    if (this.busy) return true;
    if (this.screen === '') return false;
    this.screen = ''; this.error = ''; this.notice = '';
    if (this.recovery === 'reload') this.recovery = '';
    return true;
  }

  private async initialize(): Promise<void> {
    this.busy = true; this.error = '';
    try {
      this.client = await OnlineClient.resume(new HttpTransport(), new AssetSessionVault());
      this.syncing = false;
      if (this.client) {
        this.serverUrl = this.client.address();
        this.data = await this.client.state(); this.online = true; this.ready = true; this.refreshRequired = false;
        this.resetView(); this.startPolling();
        await this.refreshReminders();
      }
    } catch (error) { this.error = (error as Error).message || '无法连接服务，请检查网络后重试'; }
    finally { this.busy = false; }
  }

  private async startLocal(): Promise<void> {
    this.error = '';
    this.busy = true;
    try {
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      this.store = await LocalStore.open(new FileStorage(context));
      this.data = this.store.snapshot();
      this.online = false; this.client = undefined; this.syncing = false; this.stopPolling(); this.refreshRequired = false;
      this.resetView();
      this.ready = true;
      await this.refreshReminders();
    } catch (error) {
      this.error = (error as Error).message;
    } finally { this.busy = false; }
  }

  private async authenticate(): Promise<void> {
    this.busy = true; this.error = '';
    try {
      if (this.registerMode && !this.accountName.trim()) throw new Error('请填写成员昵称');
      this.client = await OnlineClient.authenticate(new HttpTransport(), new AssetSessionVault(),
        this.serverUrl, this.username, this.password, this.registerMode ? this.accountName : '');
      this.syncing = false;
      this.password = '';
      this.data = await this.client.state(); this.online = true; this.ready = true; this.screen = '';
      this.refreshRequired = false; this.resetView(); this.startPolling();
      await this.refreshReminders();
    } catch (error) { this.error = (error as Error).message || '连接失败，请检查服务地址后重试'; }
    finally { this.busy = false; }
  }

  private startPolling(): void {
    this.stopPolling();
    if (!this.foreground) return;
    this.pollTimer = setInterval(() => {
      if (this.foreground && this.online && this.ready && !this.busy && this.screen === '' &&
        (this.scope !== 'mine' || this.calendarScope !== 'mine')) this.refreshOnline();
    }, 30000);
  }

  private stopPolling(): void { if (this.pollTimer !== -1) clearInterval(this.pollTimer); this.pollTimer = -1; }

  private async refreshOnline(): Promise<void> {
    if (!this.client || !this.online || this.busy || this.syncing) return;
    const client = this.client;
    this.syncing = true;
    try {
      const state = await client.state();
      if (client !== this.client || !this.online) return;
      this.data = state;
      this.normaliseScopes();
      this.error = this.recovery === 'reload' ? '最新数据已刷新，当前输入仍保留。确认后可载入最新内容。' : '';
      if (this.recovery === 'login') this.recovery = '';
      if (this.refreshRequired) { this.screen = ''; this.notice = '操作已提交，数据已刷新'; this.refreshRequired = false; }
      await this.refreshReminders();
    } catch (error) {
      if (client === this.client) {
        if (recoveryAction(error as Error) === 'login') this.recovery = 'login';
        this.error = (error as Error).message || '刷新失败，已保留当前内容';
      }
    }
    finally { if (client === this.client) this.syncing = false; }
  }

  private normaliseScopes(): void {
    if (this.scope !== 'mine' && !this.lists().some((list: TaskList) => list.id === this.scope)) this.scope = 'mine';
    if (this.calendarScope !== 'mine' && !this.lists().some((list: TaskList) => list.id === this.calendarScope)) this.calendarScope = 'mine';
    if (this.screen === 'members' && !this.lists().some((list: TaskList) => list.id === this.manageListId)) this.screen = '';
    if (!this.libraries().some((library: Library) => library.id === this.selectedLibrary)) this.selectedLibrary = this.libraries()[0]?.id || '';
  }

  private resetView(): void {
    this.tab = 0; this.screen = ''; this.scope = 'mine'; this.calendarScope = 'mine';
    this.assigneeFilter = 'all'; this.filter = 'pending'; this.query = '';
    const today = new Date();
    this.year = today.getFullYear(); this.month = today.getMonth(); this.selectedDay = dateKey(today);
    this.selectedLibrary = this.libraries()[0]?.id || '';
    this.generated = new GeneratedName('', 'combine', ''); this.generatedSaved = false; this.generatedId = '';
    this.editId = ''; this.editVersion = 0; this.title = ''; this.note = ''; this.listId = ''; this.assignee = ''; this.due = '';
    this.slotOne = ''; this.slotTwo = ''; this.slotThree = ''; this.thirdSlot = false;
    this.manageListId = ''; this.inviteCode = ''; this.foundList = ''; this.shareRecordId = ''; this.shareIds = [];
    this.creationListId = ''; this.notice = '';
    this.recovery = '';
  }

  private async logout(): Promise<void> {
    this.busy = true;
    try { if (this.client) await this.client.logout(); }
    catch (error) { this.error = recoveryAction(error as Error) === 'login' ? '' : '退出未能全部确认，请重试连接后退出，或清除本机登录信息'; }
    finally {
      this.stopPolling(); this.client = undefined; this.store = undefined; this.online = false;
      this.syncing = false;
      this.data = new AppState(); this.ready = false; this.resetView(); this.password = '';
      this.refreshRequired = false;
      await this.refreshReminders(); this.busy = false;
    }
  }

  private async clearSession(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await new AssetSessionVault().clear();
      this.client = undefined; this.error = ''; this.notice = '本机登录信息已清除';
    } catch (error) { this.error = '无法清除安全存储，请解锁设备后重试'; }
    finally { this.busy = false; }
  }

  private newId(): string { return util.generateRandomUUID(); }
  private async refreshReminders(): Promise<void> {
    try {
      this.reminderStatus = await this.reminders.sync(this.data);
      this.reminderCleanupNeeded = false;
    } catch (error) {
      this.reminderCleanupNeeded = !this.ready && this.data.tasks.length === 0;
      this.reminderStatus = this.reminderCleanupNeeded ? '旧账号的系统提醒尚未清除，请重试' : '系统提醒尚未更新，请在个人页面重试；待办数据已保留';
    }
  }

  private async enableReminders(): Promise<void> {
    this.busy = true;
    try {
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      this.reminderStatus = await this.reminders.enable(context, this.data);
      this.reminderCleanupNeeded = false;
    } catch (error) { this.reminderStatus = '提醒未启用或更新失败，请检查系统通知授权后重试'; }
    finally { this.busy = false; }
  }
  private person(id: string): string {
    return this.data.people.find((person: Person) => person.id === id)?.name || '未分配';
  }
  private lists(): TaskList[] { return Rules.lists(this.data); }
  private libraries(): Library[] { return this.data.libraries.filter((library: Library) => library.owner === this.data.user); }
  private records(): NameRecord[] { return Rules.records(this.data, this.calendarScope); }
  private tasks(): Task[] { return Rules.tasks(this.data, this.scope, this.filter, this.query, this.assigneeFilter); }
  private currentList(): TaskList | undefined { return this.data.lists.find((list: TaskList) => list.id === this.manageListId); }
  private managedList(): TaskList {
    const list = this.currentList();
    if (!list) throw new Error('清单已发生变化，请刷新');
    return list;
  }
  private sharedRecord(): NameRecord {
    const record = this.data.records.find((record: NameRecord) => record.id === this.shareRecordId);
    if (!record) throw new Error('记录已发生变化，请刷新');
    return record;
  }

  private async lookupInvitation(): Promise<void> {
    this.error = ''; this.foundList = ''; this.busy = true;
    try {
      if (this.online && this.client) {
        const preview = await this.client.findInvitation(this.inviteCode);
        if (preview.alreadyJoined) throw new Error('你已经加入了这份清单');
        this.foundList = preview.name;
      } else this.foundList = Rules.findInvitation(this.data, this.inviteCode, Date.now()).name;
    } catch (error) {
      if (recoveryAction(error as Error) === 'login') this.recovery = 'login';
      this.error = (error as Error).message;
    }
    finally { this.busy = false; }
  }

  private async generateInvite(): Promise<void> {
    await this.change((state: AppState) => {
      Rules.invite(state, this.manageListId, `SHIRI-${this.newId().replace(/-/g, '').slice(0, 12).toUpperCase()}`, Date.now());
    }, '邀请已生成', false, async (client: OnlineClient) => {
      this.inviteCode = (await client.invite(this.managedList())).code;
    });
  }

  private navigate(tab: number): void {
    this.tab = tab; this.error = ''; this.notice = '';
    if (this.online) this.refreshOnline();
  }

  private async change(action: (state: AppState) => void, message: string, close: boolean = true,
    remote?: (client: OnlineClient) => Promise<void>): Promise<void> {
    if (this.busy || this.syncing) return;
    if (this.recovery !== '') return;
    if (this.refreshRequired) { this.error = '上次操作已提交，请先刷新确认结果'; return; }
    this.busy = true;
    this.error = '';
    let committed = false;
    try {
      if (this.online) {
        if (!this.client || !remote) throw new Error('此操作尚未连接服务器');
        await remote(this.client); committed = true;
        this.data = await this.client.state();
      } else {
        if (!this.store) throw new Error('本地数据尚未打开');
        this.data = await this.store.update(action);
      }
      this.normaliseScopes();
      this.notice = message;
      if (close) this.screen = '';
      await this.refreshReminders();
    } catch (error) {
      this.refreshRequired = committed;
      this.recovery = recoveryAction(error as Error);
      this.error = committed ? '操作已提交，刷新暂时失败。请点顶部刷新确认结果，避免重复创建。' : (error as Error).message || '保存失败，输入已保留，请重试';
    } finally { this.busy = false; }
  }

  private open(screen: string): void {
    if (screen === 'lists') { this.title = ''; this.creationListId = this.newId(); }
    this.error = ''; this.notice = ''; this.screen = screen;
    if (this.recovery === 'reload') this.recovery = '';
  }

  private async reloadEditing(): Promise<void> {
    if (!this.client || this.busy || this.syncing) return;
    this.busy = true;
    try {
      this.data = await this.client.state();
      this.normaliseScopes();
      if (this.screen === 'task') {
        const task = this.data.tasks.find((item: Task) => item.id === this.editId);
        if (!task) throw new Error('待办已被删除或无法访问，输入仍保留。请返回列表确认。');
        this.editTask(task);
      } else if (this.screen === 'library') {
        const library = this.data.libraries.find((item: Library) => item.id === this.editId);
        if (!library) throw new Error('词库已被删除或无法访问，输入仍保留。请返回列表确认。');
        this.editLibrary(library);
      } else if (this.screen === 'share') {
        const record = this.data.records.find((item: NameRecord) => item.id === this.shareRecordId);
        if (!record) throw new Error('记录已被删除或无法访问，当前勾选仍保留。请返回日历确认。');
        this.shareVersion = record.version;
        this.shareIds = record.sharedTo.filter((id: string) => this.lists().some((list: TaskList) => list.id === id && list.members.length > 1));
      } else {
        if (this.data.records.some((record: NameRecord) => record.id === this.generatedId)) this.generatedSaved = true;
        this.screen = '';
      }
      this.recovery = ''; this.refreshRequired = false; this.error = ''; this.notice = '已载入最新内容';
      await this.refreshReminders();
    } catch (error) {
      if (recoveryAction(error as Error) === 'login') this.recovery = 'login';
      this.error = (error as Error).message || '刷新失败，当前输入已保留';
    } finally { this.busy = false; }
  }

  private editTask(task?: Task): void {
    this.editId = task?.id || this.newId(); this.editVersion = task?.version || 0;
    this.title = task?.title || ''; this.note = task?.note || '';
    this.listId = task?.listId || (this.scope === 'mine' ? this.lists()[0]?.id || '' : this.scope);
    this.assignee = task ? task.assignee : this.data.user;
    this.due = task ? localDue(task.due) : '';
    this.open('task');
  }

  private editLibrary(library?: Library): void {
    this.editId = library?.id || this.newId(); this.title = library?.name || '';
    this.editVersion = library?.version || 0;
    this.mode = library?.mode || 'combine'; this.slotOne = library?.slots[0]?.join('\n') || '';
    this.slotTwo = library?.slots[1]?.join('\n') || ''; this.slotThree = library?.slots[2]?.join('\n') || '';
    this.thirdSlot = (library?.slots.length || 0) === 3; this.open('library');
  }

  private async saveTask(): Promise<void> {
    await this.change((state: AppState) => Rules.saveTask(state, this.editId, this.listId, this.title,
      this.note, this.assignee, this.due.trim().replace(' ', 'T'), Date.now(), this.editVersion), '待办已保存', true,
      (client: OnlineClient) => client.saveTask(this.data.tasks.find((task: Task) => task.id === this.editId), this.listId,
        this.title, this.note, this.assignee, this.due.trim().replace(' ', 'T'), this.editVersion, this.editId));
  }

  private chooseDue(): void {
    const value = this.due.trim().replace(' ', 'T');
    const selected = value && validDue(value) ? new Date(value) : new Date();
    this.getUIContext().showDatePickerDialog({
      start: new Date(2000, 0, 1), end: new Date(2100, 11, 31), selected: selected,
      showTime: true, useMilitaryTime: true,
      onDateAccept: (date: Date) => { this.due = localDue(date.toISOString()); }
    });
  }

  private async saveLibrary(): Promise<void> {
    const texts = this.mode === 'full' ? [this.slotOne] : this.thirdSlot
      ? [this.slotOne, this.slotTwo, this.slotThree] : [this.slotOne, this.slotTwo];
    await this.change((state: AppState) => Rules.saveLibrary(state, this.editId, this.title, this.mode, texts), '词库已保存', true,
      (client: OnlineClient) => client.saveLibrary(this.data.libraries.find((library: Library) => library.id === this.editId), this.title, this.mode, texts, this.editVersion, this.editId));
    if (!this.error) this.selectedLibrary = this.editId;
  }

  private generate(): void {
    try {
      this.generated = Rules.generate(this.data, this.selectedLibrary);
      this.generatedId = this.newId();
      this.generatedSaved = false; this.error = ''; this.notice = '';
    } catch (error) { this.error = (error as Error).message; }
  }

  private async saveName(): Promise<void> {
    await this.change((state: AppState) => Rules.saveName(state, this.newId(), this.generated, new Date()), '已收进今天的名字日历', true,
      async (client: OnlineClient) => { await client.saveName(this.generated, this.generatedId); this.generatedSaved = true; });
    if (!this.error) this.generatedSaved = true;
  }

  private confirm(message: string, action: () => void): void {
    this.getUIContext().showAlertDialog({ title: '请确认', message: message,
      primaryButton: { value: '取消', action: () => {} }, secondaryButton: { value: '确认', action: action } });
  }

  private async importText(index: number): Promise<void> {
    this.error = '';
    try {
      const options = new picker.DocumentSelectOptions();
      options.maxSelectNumber = 1;
      options.fileSuffixFilters = ['纯文本|.txt'];
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      const uris = await new picker.DocumentViewPicker(context).select(options);
      if (uris.length === 0) return;
      const file = fs.openSync(uris[0], fs.OpenMode.READ_ONLY);
      let value = '';
      try {
        const size = fs.statSync(file.fd).size;
        if (size > 1024 * 1024) throw new Error('请选择小于 1 MB 的 UTF-8 TXT 文件');
        const bytes = new ArrayBuffer(size);
        const read = fs.readSync(file.fd, bytes);
        if (read !== size) throw new Error('文件读取不完整，请重试');
        value = util.TextDecoder.create('utf-8', { fatal: true, ignoreBOM: false }).decodeToString(new Uint8Array(bytes));
      } finally { fs.closeSync(file); }
      if (index === 0) this.slotOne = value;
      else if (index === 1) this.slotTwo = value;
      else this.slotThree = value;
      this.notice = '文件已读取，保存词库时会去除空行与重复项';
    } catch (error) { this.error = (error as Error).message || '无法读取文件，请使用 UTF-8 TXT'; }
  }

  private moveMonth(offset: number): void {
    const date = new Date(this.year, this.month + offset, 1);
    this.year = date.getFullYear(); this.month = date.getMonth();
    this.selectedDay = dateKey(date);
  }

  @Builder
  private heading(title: string, subtitle: string) {
    Column({ space: 8 }) {
      Text(title).fontSize(27).fontWeight(FontWeight.Bold).fontColor('#343B36')
      Text(subtitle).fontSize(13).fontColor('#7A857A').lineHeight(21)
    }.alignItems(HorizontalAlign.Start).width('100%').padding({ top: 8, bottom: 12 })
  }

  @Builder
  private action(label: string, run: () => void) {
    Button({ type: ButtonType.Normal }) {
      Text(label).fontSize(16).fontWeight(FontWeight.Medium).fontColor('#FFFFFF').textAlign(TextAlign.Center)
    }.backgroundColor('#476F58').constraintSize({ minHeight: 48 }).padding(12).borderRadius(16).width('100%')
      .enabled(!this.busy && !this.syncing && !this.refreshRequired && (!this.ready || this.recovery === '')).onClick(run)
  }

  @Builder
  private secondary(label: string, run: () => void) {
    Button({ type: ButtonType.Normal }) {
      Text(label).fontSize(14).fontColor('#476F58').textAlign(TextAlign.Center)
    }.backgroundColor('#ECF0E7').constraintSize({ minHeight: 48, maxWidth: '100%' })
      .padding({ left: 16, right: 16, top: 12, bottom: 12 }).borderRadius(16)
      .enabled(!this.busy).onClick(run)
  }

  @Builder
  private navigationButton(label: string, symbol: string, index: number) {
    Button({ type: ButtonType.Normal }) {
      Column({ space: 4 }) {
        Text(symbol).fontSize(18).fontColor('#476F58').accessibilityLevel('no')
        Text(label).fontSize(12).fontColor('#476F58').textAlign(TextAlign.Center)
      }.width('100%').padding({ top: 8, bottom: 8, left: 4, right: 4 })
    }.layoutWeight(1).constraintSize({ minHeight: 56 }).borderRadius(16)
      .backgroundColor(this.tab === index ? '#E9EFE4' : Color.Transparent).onClick(() => this.navigate(index))
      .id(`navigation-${index}`).accessibilityGroup(true).accessibilityText(label).accessibilitySelected(this.tab === index)
  }

  @Builder
  private empty(message: string) {
    Text(message).fontSize(14).fontColor('#7A857A').lineHeight(23).padding(28).width('100%')
      .textAlign(TextAlign.Center).backgroundColor('#FFFFFF').borderRadius(20)
  }

  @Builder
  private taskCard(task: Task) {
    Column({ space: 12 }) {
      Row({ space: 12 }) {
        Checkbox({ name: task.id }).select(task.done).selectedColor('#476F58')
          .onChange((selected: boolean) => {
            if (selected !== task.done) this.change((state: AppState) => Rules.toggleTask(state, task.id, task.version), selected ? '又完成了一件小事' : '已恢复为待办', false,
              (client: OnlineClient) => client.toggleTask(task));
          }).enabled(!this.busy).accessibilityText(`${task.done ? '恢复' : '完成'}：${task.title}`)
        Column({ space: 6 }) {
          Text(task.title).fontSize(16).fontWeight(FontWeight.Medium).fontColor(task.done ? '#949B94' : '#343B36')
          Text(`${this.data.lists.find((list: TaskList) => list.id === task.listId)?.name || ''} · ${this.person(task.assignee)}`)
            .fontSize(11).fontColor('#7A857A')
        }.alignItems(HorizontalAlign.Start).layoutWeight(1).onClick(() => this.editTask(task))
      }.width('100%')
      if (task.note) { Text(task.note).fontSize(13).fontColor('#7A857A').width('100%') }
      Text(task.due ? localDue(task.due) : '未设截止时间').fontSize(12)
        .fontColor(!task.done && task.due !== '' && new Date(task.due).getTime() < Date.now() ? '#B57552' : '#7A857A')
      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
        Button('编辑').fontSize(12).fontColor('#476F58').backgroundColor(Color.Transparent).onClick(() => this.editTask(task)).enabled(!this.busy)
          .constraintSize({ minWidth: 48, minHeight: 48 }).accessibilityText(`编辑待办：${task.title}`)
        Button('删除').fontSize(12).fontColor('#A65D54').backgroundColor(Color.Transparent).enabled(!this.busy)
          .constraintSize({ minWidth: 48, minHeight: 48 }).accessibilityText(`删除待办：${task.title}`)
          .onClick(() => this.confirm(`删除「${task.title}」？删除后无法恢复。`, () => {
            this.change((state: AppState) => Rules.deleteTask(state, task.id, task.version), '待办已删除', false,
              (client: OnlineClient) => client.deleteTask(task));
          }))
      }.width('100%')
    }.padding(16).backgroundColor('#FFFFFF').borderRadius(18).alignItems(HorizontalAlign.Start).width('100%')
  }

  @Builder
  private taskPage() {
    this.heading('让小事，安排得刚刚好。', '慢慢来，把日常过成自己喜欢的样子。')
    Text(this.reminderStatus).fontSize(11).fontColor('#7A857A').width('100%')
    Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(12), cross: LengthMetrics.vp(8) } }) {
      Text(`待办 ${Rules.tasks(this.data, 'mine', 'pending').length}`).fontSize(14).fontColor('#476F58')
      Text(`已完成 ${Rules.tasks(this.data, 'mine', 'done').length}`).fontSize(14).fontColor('#8B7AA8')
      this.secondary('清单管理', () => this.open('lists'))
    }.padding(12).backgroundColor('#E9EFE4').borderRadius(16).width('100%')
    Select([{ value: '我的待办' }, ...this.lists().map((list: TaskList): SelectOption => ({ value: list.name }))])
      .accessibilityText('待办清单视角')
      .value(this.scope === 'mine' ? '我的待办' : this.data.lists.find((list: TaskList) => list.id === this.scope)?.name || '我的待办')
      .onSelect((index: number) => {
        this.scope = index === 0 ? 'mine' : this.lists()[index - 1].id; this.assigneeFilter = 'all';
        if (this.online) this.refreshOnline();
      })
    this.action('＋ 新建待办', () => this.editTask())
    Search({ value: this.query, placeholder: '搜索标题或备注' }).onChange((value: string) => this.query = value).accessibilityText('搜索待办标题或备注')
    Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
      this.secondary(this.filter === 'pending' ? '待办 ✓' : '待办', () => this.filter = 'pending')
      this.secondary(this.filter === 'done' ? '已完成 ✓' : '已完成', () => this.filter = 'done')
      this.secondary(this.filter === 'all' ? '全部 ✓' : '全部', () => this.filter = 'all')
    }.width('100%')
    Select([{ value: '全部负责人' }, { value: '未分配' }, ...this.data.people.map((person: Person): SelectOption => ({ value: person.name }))])
      .accessibilityText('按负责人筛选待办')
      .value(this.assigneeFilter === 'all' ? '全部负责人' : this.person(this.assigneeFilter))
      .onSelect((index: number) => this.assigneeFilter = index === 0 ? 'all' : index === 1 ? '' : this.data.people[index - 2].id)
    Text('按截止时间排序 · 未设截止时间的待办排在最后').fontSize(11).fontColor('#949B94').width('100%')
    ForEach(this.tasks(), (task: Task) => { this.taskCard(task) }, (task: Task) => `${task.id}-${task.version}`)
    if (this.tasks().length === 0) { this.empty('这里暂时没有待办，给自己留一点空白也很好。') }
  }

  @Builder
  private namesPage() {
    this.heading('偶然遇见，一个好名字。', '让随机带来一点灵感，喜欢的才收进日历。')
    Select(this.libraries().map((library: Library): SelectOption => ({ value: `${library.name} · ${library.mode === 'full' ? '完整名称' : '词组组合'}` })))
      .accessibilityText('选择名字来源词库')
      .value(this.libraries().find((library: Library) => library.id === this.selectedLibrary)?.name || '请选择词库')
      .onSelect((index: number) => { this.selectedLibrary = this.libraries()[index].id; this.generated = new GeneratedName('', 'combine', ''); })
    Column({ space: 24 }) {
      Text('✧').fontSize(48).fontColor('#8B7AA8').accessibilityLevel('no')
      Text(this.generated.name || '下一个名字，会是什么呢？').fontSize(28).fontColor('#476F58').fontWeight(FontWeight.Medium).textAlign(TextAlign.Center)
      Text(this.generated.source ? `来自「${this.generated.source}」` : '完整名称抽取，或 2–3 个有序词组组合').fontSize(12).fontColor('#949B94')
      this.action('✧ 生成一个名字', () => this.generate())
      Button({ type: ButtonType.Normal }) {
        Text(this.generatedSaved ? '已保存到日历' : '喜欢，保存到日历').fontSize(16).fontColor('#796591').textAlign(TextAlign.Center)
      }.backgroundColor('#EBE5F1').constraintSize({ minHeight: 48 }).padding(12).borderRadius(16).width('100%')
        .enabled(this.generated.name !== '' && !this.generatedSaved && !this.busy).onClick(() => this.saveName())
    }.padding(24).width('100%').backgroundColor('#FFFFFF').borderRadius(24)
    this.secondary('管理我的词库', () => this.open('libraries'))
    Text('名字与待办各自独立。生成不会自动保存，保存或分享名字也不会创建待办。').fontSize(12).fontColor('#7A857A').lineHeight(22)
    if (this.libraries().length === 0) { this.empty('还没有词库，先创建一份自己的灵感。') }
  }

  @Builder
  private recordCard(record: NameRecord) {
    Column({ space: 12 }) {
      Text(record.name).fontSize(23).fontColor('#796591').fontWeight(FontWeight.Medium)
      Text(record.owner === this.data.user ? `${record.date} · ${record.mode === 'full' ? '完整名称' : '词组组合'}` : `${record.date} · ${this.person(record.owner)}`).fontSize(12).fontColor('#949B94')
      if (record.owner === this.data.user) {
        Text(`来自「${record.source}」`).fontSize(12).fontColor('#949B94')
        Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
          this.secondary(record.sharedTo.length > 0 ? '管理分享' : '分享', () => {
            this.shareRecordId = record.id;
            this.shareVersion = record.version;
            this.shareIds = record.sharedTo.filter((id: string) => this.lists().some((list: TaskList) => list.id === id && list.members.length > 1));
            this.open('share');
          })
          this.secondary('删除记录', () => this.confirm('删除后会同时从已分享的清单移除，无法恢复。', () => {
            this.change((state: AppState) => Rules.deleteRecord(state, record.id), '记录已删除', false,
              (client: OnlineClient) => client.deleteRecord(record));
          }))
        }
      }
    }.alignItems(HorizontalAlign.Start).padding(20).width('100%').backgroundColor('#FFFFFF').borderRadius(20)
  }

  @Builder
  private calendarPage() {
    this.heading('每个日子，都有自己的名字。', '那些偶然遇见的好名字，记住生活里的小小灵光。')
    Select([{ value: '我的名字日历' }, ...this.lists().filter((list: TaskList) => list.members.length > 1).map((list: TaskList): SelectOption => ({ value: list.name }))])
      .accessibilityText('名字日历视角')
      .value(this.calendarScope === 'mine' ? '我的名字日历' : this.data.lists.find((list: TaskList) => list.id === this.calendarScope)?.name || '')
      .onSelect((index: number) => {
        this.calendarScope = index === 0 ? 'mine' : this.lists().filter((list: TaskList) => list.members.length > 1)[index - 1].id;
        if (this.online) this.refreshOnline();
      })
    MonthCalendar({ year: this.year, month: this.month, selected: this.selectedDay,
      dates: this.records().map((record: NameRecord) => record.date),
      onSelect: (day: string) => { this.selectedDay = day; this.year = Number(day.slice(0, 4)); this.month = Number(day.slice(5, 7)) - 1; },
      onMove: (offset: number) => this.moveMonth(offset) })
    Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(12), cross: LengthMetrics.vp(8) } }) {
      Text(this.selectedDay).fontSize(18).fontColor('#343B36')
      this.secondary('回到今天', () => { this.selectedDay = dateKey(); this.year = new Date().getFullYear(); this.month = new Date().getMonth(); })
    }.width('100%')
    ForEach(this.records().filter((record: NameRecord) => record.date === this.selectedDay), (record: NameRecord) => {
      this.recordCard(record)
    }, (record: NameRecord) => `${record.id}-${record.version}-${record.sharedTo.join(',')}`)
    if (!this.records().some((record: NameRecord) => record.date === this.selectedDay)) { this.empty('这一天还没有名字记录，去发现一个吧。') }
  }

  @Builder
  private taskForm() {
    this.heading(this.editVersion ? '编辑这件小事' : '记下一件小事', '截止时间可留空，负责人也可以暂不分配。')
    Text('清单').fontSize(13).width('100%')
    Select(this.lists().map((list: TaskList): SelectOption => ({ value: list.name })))
      .accessibilityText('待办所属清单')
      .value(this.data.lists.find((list: TaskList) => list.id === this.listId)?.name || '请选择清单')
      .enabled(this.editVersion === 0).onSelect((index: number) => { this.listId = this.lists()[index].id; this.assignee = this.data.user; })
    Text('待办标题').fontSize(13).width('100%')
    TextInput({ text: this.title, placeholder: '最多 100 字' }).maxLength(100).onChange((value: string) => this.title = value).accessibilityText('待办标题，必填，最多 100 字')
    Text('备注').fontSize(13).width('100%')
    TextArea({ text: this.note, placeholder: '写一点备注' }).height(120).maxLength(2000).onChange((value: string) => this.note = value).accessibilityText('待办备注，可留空')
    Text('负责人').fontSize(13).width('100%')
    Select([{ value: '未分配' }, ...(this.data.lists.find((list: TaskList) => list.id === this.listId)?.members || []).map((id: string): SelectOption => ({ value: this.person(id) }))])
      .accessibilityText('待办负责人')
      .value(this.person(this.assignee)).onSelect((index: number) => {
        this.assignee = index === 0 ? '' : (this.data.lists.find((list: TaskList) => list.id === this.listId)?.members || [])[index - 1];
      })
    Text('截止日期与时间').fontSize(13).width('100%')
    TextInput({ text: this.due, placeholder: 'YYYY-MM-DD HH:mm，可留空' }).onChange((value: string) => this.due = value)
      .accessibilityText('截止日期与时间，可手动输入或使用下方选择器')
    Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
      this.secondary('选择日期与时间', () => this.chooseDue())
      this.secondary('清除截止时间', () => this.due = '')
    }.width('100%')
    this.action('保存待办', () => this.saveTask())
  }

  @Builder
  private libraryForm() {
    this.heading('收藏自己的灵感', '每行一个候选；保存时自动去除空行与重复项。')
    Text('每组最多 10000 个候选，每个候选最多 300 个字符；支持小于 1 MB 的 UTF-8 TXT。').fontSize(12).fontColor('#7A857A').lineHeight(22)
    Text('词库名称').fontSize(13).width('100%')
    TextInput({ text: this.title, placeholder: '最多 30 字' }).maxLength(30).onChange((value: string) => this.title = value).accessibilityText('词库名称，必填')
    Text('生成模式').fontSize(13).width('100%')
    Select([{ value: '完整名称抽取' }, { value: '有序词组组合' }]).selected(this.mode === 'full' ? 0 : 1)
      .accessibilityText('名字生成模式')
      .value(this.mode === 'full' ? '完整名称抽取' : '有序词组组合').onSelect((index: number) => this.mode = index === 0 ? 'full' : 'combine')
    Text(this.mode === 'full' ? '完整名称' : '词组 1').fontSize(14).width('100%')
    TextArea({ text: this.slotOne, placeholder: '慢慢的\n听雨的' }).height(150).onChange((value: string) => this.slotOne = value).accessibilityText(this.mode === 'full' ? '完整名称候选，每行一个' : '词组 1 候选，每行一个')
    this.secondary('导入 UTF-8 TXT', () => this.importText(0))
    if (this.mode === 'combine') {
      Text('词组 2').fontSize(14).width('100%')
      TextArea({ text: this.slotTwo, placeholder: '小狐狸\n小水獭' }).height(150).onChange((value: string) => this.slotTwo = value).accessibilityText('词组 2 候选，每行一个')
      this.secondary('导入词组 2', () => this.importText(1))
      if (this.thirdSlot) {
        Text('词组 3').fontSize(14).width('100%')
        TextArea({ text: this.slotThree, placeholder: '旅人\n邮差' }).height(150).onChange((value: string) => this.slotThree = value).accessibilityText('词组 3 候选，每行一个')
        this.secondary('导入词组 3', () => this.importText(2))
      }
      this.secondary(this.thirdSlot ? '移除第三个词组' : '添加第三个词组', () => this.thirdSlot = !this.thirdSlot)
    }
    this.action('保存词库', () => this.saveLibrary())
  }

  @Builder
  private librariesPage() {
    this.heading('我的灵感词库', '编辑或删除词库，都不会改变已保存的名字历史。')
    this.action('＋ 创建词库', () => this.editLibrary())
    ForEach(this.libraries(), (library: Library) => {
      Column({ space: 12 }) {
        Text(library.name).fontSize(20).fontColor('#476F58')
        Text(`${library.mode === 'full' ? '完整名称' : `${library.slots.length} 个有序词组`} · ${library.slots.map((slot: string[]) => slot.length).join(' × ')} 个候选`)
          .fontSize(12).fontColor('#7A857A')
        Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
          this.secondary('编辑', () => this.editLibrary(library))
          this.secondary('删除', () => this.confirm(`删除词库「${library.name}」？历史记录会保留。`, () => {
            this.change((state: AppState) => Rules.deleteLibrary(state, library.id), '词库已删除', false,
              (client: OnlineClient) => client.deleteLibrary(library));
          }))
        }
      }.padding(20).width('100%').backgroundColor('#FFFFFF').borderRadius(18).alignItems(HorizontalAlign.Start)
    }, (library: Library) => `${library.id}-${library.version}`)
  }

  @Builder
  private listsPage() {
    this.heading('给小事一个家', '创建个人清单，邀请伙伴后就能一起完成。')
    Text('新清单名称').fontSize(13).width('100%')
    TextInput({ text: this.title, placeholder: '最多 30 字' }).maxLength(30).onChange((value: string) => this.title = value).accessibilityText('新清单名称，必填')
    this.action('创建清单', () => {
      this.change((state: AppState) => Rules.createList(state, this.newId(), this.title), '清单已创建', false,
        (client: OnlineClient) => client.createList(this.title, this.creationListId)).then(() => {
        if (!this.error) { this.title = ''; this.creationListId = this.newId(); }
      });
    })
    this.secondary('通过邀请加入', () => { this.inviteCode = ''; this.foundList = ''; this.open('join'); })
    ForEach(this.lists(), (list: TaskList) => {
      Row() {
        Column({ space: 8 }) {
          Text(list.name).fontSize(17).fontColor('#343B36')
          Text(`${list.members.length} 位成员 · 所有者 ${this.person(list.owner)}`).fontSize(12).fontColor('#7A857A')
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
        this.secondary('管理', () => { this.manageListId = list.id; this.inviteCode = ''; this.open('members'); })
      }.padding(18).backgroundColor('#FFFFFF').borderRadius(18).width('100%')
    }, (list: TaskList) => `${list.id}-${list.version}`)
  }

  @Builder
  private membersPage() {
    this.heading(this.currentList()?.name || '清单', '所有者管理邀请与成员；普通成员可以主动退出。')
    ForEach(this.currentList()?.members || [], (id: string) => {
      Column({ space: 8 }) {
        Text(`${this.person(id)}${id === this.currentList()?.owner ? ' · 所有者' : ''}`).fontSize(16)
        if (this.currentList()?.owner === this.data.user && id !== this.data.user) {
          Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
            this.secondary('移除成员', () => this.confirm('移除后，该成员未完成的待办将变为未分配。', () => {
              this.change((state: AppState) => Rules.removeMember(state, this.manageListId, id), '成员已移除', false,
                (client: OnlineClient) => client.removeMember(this.managedList(), id));
            }))
            this.secondary('转让所有权', () => this.confirm(`将清单交给${this.person(id)}？你会保留成员身份。`, () => {
              this.change((state: AppState) => Rules.transfer(state, this.manageListId, id), '所有权已转让', false,
                (client: OnlineClient) => client.transfer(this.managedList(), id));
            }))
          }
        }
      }.padding(16).backgroundColor('#FFFFFF').borderRadius(16).width('100%').alignItems(HorizontalAlign.Start)
    }, (id: string) => id)
    if (this.currentList()?.owner === this.data.user) {
      this.action('生成七天有效邀请码', () => this.generateInvite())
      if ((this.online ? this.inviteCode : this.currentList()?.invite) || (this.currentList()?.inviteExpires || 0) > Date.now()) {
        Text(this.online ? this.inviteCode || '已有有效邀请，可撤销或重新生成' : this.currentList()?.invite || '').fontSize(18).fontColor('#476F58').copyOption(CopyOptions.LocalDevice)
        Text(this.online ? '长按复制并发给伙伴；对方登录后可确认加入。新生成的邀请会替换旧邀请。' : '长按复制，切换本机体验账号后可加入。').fontSize(12).fontColor('#7A857A')
        this.secondary('撤销邀请', () => this.change((state: AppState) => Rules.revokeInvite(state, this.manageListId), '邀请已撤销', false,
          async (client: OnlineClient) => { await client.revokeInvite(this.managedList()); this.inviteCode = ''; }))
      }
      this.secondary('删除清单', () => this.confirm('删除清单及其所有待办？名字原始记录会保留。此操作无法恢复。', () => {
        this.change((state: AppState) => Rules.deleteList(state, this.manageListId), '清单已删除', true,
          (client: OnlineClient) => client.deleteList(this.managedList()));
      }))
    } else {
      this.secondary('退出清单', () => this.confirm('退出后，你未完成的待办会变为未分配。', () => {
        this.change((state: AppState) => Rules.removeMember(state, this.manageListId, state.user), '已退出清单', true,
          (client: OnlineClient) => client.removeMember(this.managedList(), this.data.user));
      }))
    }
  }

  @Builder
  private joinPage() {
    this.heading('和伙伴一起完成小事', '粘贴邀请码，核对清单后再确认加入。')
    Text('邀请码').fontSize(13).width('100%')
    TextInput({ text: this.inviteCode, placeholder: 'SHIRI-…' }).enabled(!this.busy).onChange((value: string) => { this.inviteCode = value; this.foundList = ''; }).accessibilityText('清单邀请码，必填')
    this.action('查找邀请', () => this.lookupInvitation())
    if (this.foundList !== '') {
      this.empty(`即将加入「${this.foundList}」`)
      this.action('确认加入', () => this.change((state: AppState) => Rules.join(state, this.inviteCode, Date.now()), '已加入清单', true,
        (client: OnlineClient) => client.join(this.inviteCode)))
    }
  }

  @Builder
  private sharePage() {
    this.heading('把好名字分享给伙伴', '只分享名称与日期，不公开你的原始词库。')
    ForEach(this.lists().filter((list: TaskList) => list.members.length > 1), (list: TaskList) => {
      Row() {
        Text(list.name).layoutWeight(1)
        Checkbox({ name: list.id }).select(this.shareIds.includes(list.id)).selectedColor('#476F58').onChange((checked: boolean) => {
          this.shareIds = checked ? [...this.shareIds.filter((id: string) => id !== list.id), list.id] : this.shareIds.filter((id: string) => id !== list.id);
        }).accessibilityText(`分享到清单：${list.name}`)
      }.padding(16).backgroundColor('#FFFFFF').borderRadius(16).width('100%')
    }, (list: TaskList) => `${list.id}-${list.version}`)
    this.action('保存分享设置', () => this.change((state: AppState) => Rules.share(state, this.shareRecordId, this.shareIds), '分享设置已保存', true,
      (client: OnlineClient) => client.share(this.sharedRecord(), this.shareIds, this.shareVersion)))
    Text('取消全部勾选可撤回分享。').fontSize(12).fontColor('#949B94')
  }

  @Builder
  private profilePage() {
    this.heading('我们的小天地', this.online ? '已登录协作服务，清单变更联网保存。' : '本机体验版本，数据保存在这台设备上。')
    if (this.online) {
      Text(`当前成员：${this.person(this.data.user)}`).fontSize(18).fontColor('#476F58')
      this.secondary('退出账号', () => this.logout())
    } else {
      this.empty('以下切换仅用于体验成员视角，不会修改服务器账号。')
      ForEach(this.data.people, (person: Person) => {
        this.secondary(`${person.name}${person.id === this.data.user ? ' · 当前成员' : ''}`, () => {
          this.change((state: AppState) => state.user = person.id, '已切换体验成员').then(() => {
            if (!this.error) {
              this.resetView();
            }
          });
        })
      }, (person: Person) => `${person.id}-${person.name}`)
      this.secondary('连接协作服务', () => { this.ready = false; this.screen = ''; this.stopPolling(); })
    }
    Text(this.reminderStatus).fontSize(13).fontColor('#7A857A').lineHeight(23)
    this.action('开启或重试系统到期提醒', () => this.enableReminders())
    Text('提醒针对自己的未完成待办。完成、删除、修改截止时间或退出清单后会更新；最多安排最近 30 项。系统通知关闭时无法提醒。').fontSize(12).fontColor('#949B94').lineHeight(23)
  }

  @Builder
  private authPage() {
    Scroll() {
      Column({ space: 18 }) {
        this.heading('让日常，多一点美好。', this.registerMode ? '创建账号，和熟悉的人一起完成小事。' : '登录拾日，拾起你的小日常。')
        if (this.reminderCleanupNeeded) {
          Text(this.reminderStatus).fontSize(13).fontColor('#A64940').lineHeight(22)
          this.secondary('重试清除旧提醒', () => this.refreshReminders())
        }
        Text('服务地址').fontSize(13).width('100%')
        TextInput({ text: this.serverUrl, placeholder: '例如 http://192.168.1.10:3000' }).onChange((value: string) => this.serverUrl = value).accessibilityText('协作服务地址，必填')
        Text('用户名').fontSize(13).width('100%')
        TextInput({ text: this.username, placeholder: '3–30 位字母、数字或下划线' }).maxLength(30).onChange((value: string) => this.username = value).accessibilityText('用户名，必填')
        Text('密码').fontSize(13).width('100%')
        TextInput({ text: this.password, placeholder: '至少 8 个字符' }).type(InputType.Password).maxLength(128).onChange((value: string) => this.password = value).accessibilityText('登录密码，必填')
        if (this.registerMode) {
          Text('成员昵称').fontSize(13).width('100%')
          TextInput({ text: this.accountName, placeholder: '最多 30 字' }).maxLength(30).onChange((value: string) => this.accountName = value).accessibilityText('成员昵称，必填')
        }
        this.action(this.busy ? '正在连接…' : this.registerMode ? '注册并登录' : '登录', () => this.authenticate())
        this.secondary(this.registerMode ? '已有账号，去登录' : '还没有账号，去注册', () => this.registerMode = !this.registerMode)
        this.secondary('重试上次连接', () => this.initialize())
        this.secondary('清除本机登录信息', () => this.clearSession())
        this.secondary('先体验本机版本', () => this.startLocal())
        Text('联网模式需要连接你部署的协作服务。服务地址填写开发电脑的局域网 IP；本机体验的数据不会自动上传。').fontSize(12).fontColor('#7A857A').lineHeight(22)
      }.padding(24).width('100%').constraintSize({ maxWidth: 680 }).enabled(!this.busy)
    }.layoutWeight(1).width('100%')
  }

  build() {
    Column() {
      Row() {
        if (this.screen !== '') {
          Button('‹ 返回').fontColor('#476F58').backgroundColor(Color.Transparent).enabled(!this.busy)
            .onClick(() => { this.screen = ''; this.error = ''; this.notice = ''; if (this.recovery === 'reload') this.recovery = ''; })
        }
        Text('拾日 SHIRI').fontSize(20).fontWeight(FontWeight.Bold).fontColor('#476F58').layoutWeight(1).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
        if (this.online && this.ready) {
          Button(this.syncing ? '刷新中' : '↻ 刷新').fontSize(12).fontColor('#476F58').backgroundColor(Color.Transparent)
            .enabled(!this.busy && !this.syncing).onClick(() => this.refreshOnline())
        }
        Button({ type: ButtonType.Normal }) {
          Text(this.person(this.data.user)).fontSize(13).fontColor('#476F58').maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
        }.backgroundColor('#E9EFE4').constraintSize({ minHeight: 48, maxWidth: 112 }).padding(12).borderRadius(16)
          .accessibilityText(`个人页面，当前成员：${this.person(this.data.user)}`)
          .onClick(() => this.open('profile')).enabled(this.ready && !this.busy)
      }.padding({ left: 16, right: 16, top: 12, bottom: 12 }).width('100%')
      if (this.error) {
        Text(this.error).fontSize(13).fontColor('#A64940').padding(14).width('100%').backgroundColor('#FAEDE9')
      }
      if (this.recovery === 'reload' && this.ready) {
        Button('载入最新内容').backgroundColor('#ECF0E7').fontColor('#476F58').enabled(!this.busy && !this.syncing)
          .onClick(() => this.confirm('将用最新内容替换当前输入，未保存的修改会丢弃。是否继续？', () => this.reloadEditing()))
      }
      if (this.recovery === 'login' && this.ready) {
        Button('重新登录').backgroundColor('#ECF0E7').fontColor('#476F58').enabled(!this.busy && !this.syncing)
          .onClick(() => this.confirm('重新登录将离开当前页面，未保存的输入会丢弃。是否继续？', () => this.logout()))
      }
      if (this.notice) {
        Text(this.notice).fontSize(13).fontColor('#476F58').padding(10).width('100%').backgroundColor('#E9EFE4')
      }
      if (!this.ready) {
        this.authPage()
      } else {
        Scroll() {
          Column({ space: 16 }) {
            if (this.screen === 'task') { this.taskForm() }
            else if (this.screen === 'library') { this.libraryForm() }
            else if (this.screen === 'libraries') { this.librariesPage() }
            else if (this.screen === 'lists') { this.listsPage() }
            else if (this.screen === 'members') { this.membersPage() }
            else if (this.screen === 'join') { this.joinPage() }
            else if (this.screen === 'share') { this.sharePage() }
            else if (this.screen === 'profile') { this.profilePage() }
            else if (this.tab === 0) { this.taskPage() }
            else if (this.tab === 1) { this.namesPage() }
            else { this.calendarPage() }
          }.padding(20).width('100%').constraintSize({ maxWidth: 680 }).enabled(!this.busy && !this.syncing)
        }.layoutWeight(1).width('100%').align(Alignment.Top).scrollBar(BarState.Auto)
        if (this.screen === '') {
          Row({ space: 6 }) {
            this.navigationButton('待办', '☷', 0)
            this.navigationButton('名字灵感', '✧', 1)
            this.navigationButton('名字日历', '▦', 2)
          }.padding(10).backgroundColor('#FFFFFF').width('100%').enabled(!this.busy && !this.syncing)
        }
      }
    }.width('100%').height('100%').backgroundColor('#F7F8F5')
  }
}
