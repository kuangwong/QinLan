import { AppState, GeneratedName, Library, NameMode, NameRecord, Task, TaskList, librarySlots, dateKey, validDue } from './Models';
import { decode } from './Codec';
import { ApiFailure } from './ApiFailure';

export interface ApiTransport {
  request(baseUrl: string, method: string, path: string, token: string, body: string): Promise<string>;
}

/** 拾日云端服务固定地址；APP 不向用户索取服务地址。 */
export const DEFAULT_SERVER: string = 'http://82.157.149.117:8080';

export class RemoteSession {
  baseUrl: string = '';
  token: string = '';
  userId: string = '';
  expiresAt: string = '';
}

export interface SessionVault {
  read(): Promise<RemoteSession | undefined>;
  write(session: RemoteSession): Promise<void>;
  clear(): Promise<void>;
}

interface Credentials { username: string; password: string }
interface Registration extends Credentials { name: string }
interface NameInput { name: string; id?: string }
interface Expected { version: number }
interface TaskInput { title: string; note: string; assignee: string; due: string; id?: string }
interface TaskUpdate extends TaskInput { done: boolean; version: number }
interface LibraryInput { name: string; mode: NameMode; slots: string[][]; id?: string }
interface LibraryUpdate { data: LibraryInput; version: number }
interface RecordInput { name: string; mode: NameMode; source: string; date: string; id?: string }
interface ShareInput { listIds: string[]; version: number }
interface TransferInput { userId: string; version: number }
interface InvitationCode { code: string }
export interface Invitation { code: string; expiresAt: string; version: number }
export interface InvitationPreview { id: string; name: string; memberCount: number; alreadyJoined: boolean }

export function serverAddress(value: string): string {
  const address = value.trim().replace(/\/$/, '');
  if (!/^https?:\/\/[a-zA-Z0-9.-]+(?::[0-9]{1,5})?$/.test(address)) {
    throw new Error('服务地址无效，请清除本机登录信息后重试');
  }
  return address;
}

function validSession(session: RemoteSession): boolean {
  return typeof session === 'object' && session !== null && typeof session.token === 'string' &&
    /^[a-f0-9]{64}$/.test(session.token) && typeof session.userId === 'string' && session.userId.length > 0 &&
    typeof session.expiresAt === 'string' && Number.isFinite(new Date(session.expiresAt).getTime());
}

export class OnlineClient {
  private transport: ApiTransport;
  private vault: SessionVault;
  private session: RemoteSession;

  private constructor(transport: ApiTransport, vault: SessionVault, session: RemoteSession) {
    this.transport = transport; this.vault = vault; this.session = session;
  }

  static async resume(transport: ApiTransport, vault: SessionVault, address: string = ''): Promise<OnlineClient | undefined> {
    const session = await vault.read();
    if (session === undefined) return undefined;
    if (!validSession(session)) throw new Error('安全存储中的登录信息无法读取，请重新登录');
    session.baseUrl = serverAddress(address || session.baseUrl);
    if (new Date(session.expiresAt).getTime() <= Date.now()) { await vault.clear(); return undefined; }
    return new OnlineClient(transport, vault, session);
  }

  static async authenticate(transport: ApiTransport, vault: SessionVault, address: string,
    username: string, password: string, name: string = ''): Promise<OnlineClient> {
    const baseUrl = serverAddress(address);
    const credentials: Credentials = { username: username.trim(), password: password };
    const registration: Registration = { username: username.trim(), password: password, name: name.trim() };
    const raw = await transport.request(baseUrl, 'POST', name ? '/api/v1/auth/register' : '/api/v1/auth/login', '',
      JSON.stringify(name ? registration : credentials));
    const session = JSON.parse(raw) as RemoteSession;
    if (!validSession(session)) throw new Error('服务返回的登录信息无效，请稍后重试');
    session.baseUrl = baseUrl;
    const client = new OnlineClient(transport, vault, session);
    try { await vault.write(session); }
    catch (error) {
      // Never fall back to a plaintext file when device secure storage fails.
      try { await client.call('POST', '/api/v1/auth/logout'); } catch (revokeError) { /* The server session will expire. */ }
      throw new Error('无法安全保存登录信息，请检查设备安全存储后重试');
    }
    return client;
  }

  private async call(method: string, path: string, body: string = ''): Promise<string> {
    return this.transport.request(this.session.baseUrl, method, path, this.session.token, body || (method === 'POST' ? '{}' : ''));
  }

  address(): string { return this.session.baseUrl; }

  async state(): Promise<AppState> {
    const state = decode(await this.call('GET', '/api/v1/state'));
    if (state.user !== this.session.userId) throw new Error('账号数据不匹配，请重新登录');
    return state;
  }

  async logout(): Promise<void> {
    try { await this.call('POST', '/api/v1/auth/logout'); }
    finally { await this.vault.clear(); }
  }

  async createList(name: string, creationId: string = ''): Promise<void> {
    const input: NameInput = { name: name };
    if (creationId) input.id = creationId;
    await this.call('POST', '/api/v1/lists', JSON.stringify(input));
  }

  async saveTask(existing: Task | undefined, listId: string, title: string, note: string, assignee: string, due: string, expectedVersion: number, creationId: string = ''): Promise<void> {
    if (!existing && expectedVersion !== 0) throw new ApiFailure(404, 'NOT_FOUND', '待办已被删除，请刷新后重新确认');
    if (!validDue(due)) throw new Error('请输入有效的截止时间，例如 2026-11-03 18:30');
    const input: TaskInput = { title: title, note: note, assignee: assignee, due: due ? new Date(due).toISOString() : '' };
    if (existing) {
      const update: TaskUpdate = { title: input.title, note: input.note, assignee: input.assignee, due: input.due, done: existing.done, version: expectedVersion };
      await this.call('PATCH', `/api/v1/tasks/${existing.id}`, JSON.stringify(update));
    } else {
      if (creationId) input.id = creationId;
      await this.call('POST', `/api/v1/lists/${listId}/tasks`, JSON.stringify(input));
    }
  }

  async toggleTask(task: Task): Promise<void> {
    const input: TaskUpdate = { title: task.title, note: task.note, assignee: task.assignee, due: task.due, done: !task.done, version: task.version };
    await this.call('PATCH', `/api/v1/tasks/${task.id}`, JSON.stringify(input));
  }

  async deleteTask(task: Task): Promise<void> { await this.remove(`/api/v1/tasks/${task.id}`, task.version); }
  async deleteList(list: TaskList): Promise<void> { await this.remove(`/api/v1/lists/${list.id}`, list.version); }

  async invite(list: TaskList): Promise<Invitation> {
    const input: Expected = { version: list.version };
    return JSON.parse(await this.call('POST', `/api/v1/lists/${list.id}/invitation`, JSON.stringify(input))) as Invitation;
  }

  async revokeInvite(list: TaskList): Promise<void> { await this.remove(`/api/v1/lists/${list.id}/invitation`, list.version); }
  async removeMember(list: TaskList, userId: string): Promise<void> { await this.remove(`/api/v1/lists/${list.id}/members/${userId}`, list.version); }
  async transfer(list: TaskList, userId: string): Promise<void> {
    const input: TransferInput = { userId: userId, version: list.version };
    await this.call('POST', `/api/v1/lists/${list.id}/transfer`, JSON.stringify(input));
  }

  async findInvitation(code: string): Promise<InvitationPreview> {
    const input: InvitationCode = { code: code.trim().toUpperCase() };
    return JSON.parse(await this.call('POST', '/api/v1/invitations/lookup', JSON.stringify(input))) as InvitationPreview;
  }
  async join(code: string): Promise<void> {
    const input: InvitationCode = { code: code.trim().toUpperCase() };
    await this.call('POST', '/api/v1/invitations/join', JSON.stringify(input));
  }

  async saveLibrary(existing: Library | undefined, name: string, mode: NameMode, texts: string[], expectedVersion: number, creationId: string = ''): Promise<void> {
    if (!existing && expectedVersion !== 0) throw new ApiFailure(404, 'NOT_FOUND', '词库已被删除，请刷新后重新确认');
    const input: LibraryInput = { name: name, mode: mode, slots: librarySlots(mode, texts) };
    if (existing) {
      const update: LibraryUpdate = { data: input, version: expectedVersion };
      await this.call('PUT', `/api/v1/libraries/${existing.id}`, JSON.stringify(update));
    } else {
      if (creationId) input.id = creationId;
      await this.call('POST', '/api/v1/libraries', JSON.stringify(input));
    }
  }
  async deleteLibrary(library: Library): Promise<void> { await this.remove(`/api/v1/libraries/${library.id}`, library.version); }

  async saveName(generated: GeneratedName, creationId: string = ''): Promise<void> {
    if (generated.name.length > 900) throw new Error('名字最多 900 个字符，请调整词库后重新生成');
    const input: RecordInput = { name: generated.name, mode: generated.mode, source: generated.source, date: dateKey() };
    if (creationId) input.id = creationId;
    await this.call('POST', '/api/v1/records', JSON.stringify(input));
  }
  async share(record: NameRecord, listIds: string[], expectedVersion: number): Promise<void> {
    const input: ShareInput = { listIds: listIds, version: expectedVersion };
    await this.call('PATCH', `/api/v1/records/${record.id}/shares`, JSON.stringify(input));
  }
  async deleteRecord(record: NameRecord): Promise<void> { await this.remove(`/api/v1/records/${record.id}`, record.version); }

  private async remove(path: string, version: number): Promise<void> {
    const input: Expected = { version: version };
    await this.call('DELETE', path, JSON.stringify(input));
  }
}
