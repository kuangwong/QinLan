export type Session = { token: string; expiresAt: string; userId: string; baseUrl: string };
export type Person = { id: string; name: string };
export type OnlineList = { id: string; name: string; owner: string; members: string[]; version: number; inviteExpires: number };
export type OnlineTask = { id: string; title: string; note: string; listId: string; assignee: string; due: string; done: boolean; version: number; created: number };
export type OnlineLibrary = { id: string; name: string; mode: 'full' | 'combine'; slots: string[][]; owner: string; version: number };
export type OnlineRecord = { id: string; name: string; mode: 'full' | 'combine'; source: string; date: string; savedAt: string; owner: string; sharedTo: string[]; version: number };
export type Snapshot = { schema: number; user: string; people: Person[]; lists: OnlineList[]; tasks: OnlineTask[]; libraries: OnlineLibrary[]; records: OnlineRecord[] };
const sessionKey = 'shiri-web-session-v1';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function serviceAddress(value: string): string {
  if (!value.trim()) return '';
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('请输入完整的 HTTP 或 HTTPS 服务地址'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('服务地址只填写 HTTP 或 HTTPS 的主机与端口');
  }
  if (location.protocol === 'https:' && url.protocol !== 'https:') throw new Error('HTTPS 网页需要连接 HTTPS 服务');
  return url.origin;
}

export function restoreSession(): Session | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(sessionKey) || 'null') as Session | null;
    if (saved && /^[a-f0-9]{64}$/.test(saved.token) && typeof saved.userId === 'string' &&
      typeof saved.baseUrl === 'string' && serviceAddress(saved.baseUrl) === saved.baseUrl && new Date(saved.expiresAt).getTime() > Date.now()) return saved;
    sessionStorage.removeItem(sessionKey);
  } catch { /* Storage may be unavailable; keep the session in memory instead. */ }
  return null;
}

export function rememberSession(session: Session | null): boolean {
  try {
    if (session) sessionStorage.setItem(sessionKey, JSON.stringify(session));
    else sessionStorage.removeItem(sessionKey);
    return true;
  } catch { return false; }
}

export async function request<T>(baseUrl: string, token: string, method: string, path: string, body?: object): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method, signal: controller.signal, cache: 'no-store', credentials: 'omit',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let result: { error?: { code?: string; message?: string } };
    try { result = await response.json(); } catch {
      throw new ApiError(response.status, 'INVALID_RESPONSE', '服务响应无法读取，请检查服务地址并刷新重试');
    }
    if (!response.ok) throw new ApiError(response.status, result.error?.code || 'REQUEST_FAILED', result.error?.message || '请求失败，请稍后重试');
    return result as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'NETWORK_ERROR', '无法连接服务，当前输入已保留，请检查网络后重试');
  } finally { clearTimeout(timer); }
}

export async function getSnapshot(session: Session): Promise<Snapshot> {
  const state = await request<Snapshot>(session.baseUrl, session.token, 'GET', '/state');
  if (state.schema !== 1 || state.user !== session.userId || !Array.isArray(state.people) ||
    !state.people.some(person => person.id === session.userId) ||
    ![state.lists, state.tasks, state.libraries, state.records].every(Array.isArray)) {
    throw new ApiError(502, 'INVALID_SNAPSHOT', '服务返回的数据与当前账号不符，请重新连接');
  }
  return state;
}

export function localTime(utc: string): string {
  if (!utc) return '';
  const date = new Date(utc);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function utcTime(local: string): string {
  if (!local) return '';
  const date = new Date(local);
  if (!Number.isFinite(date.getTime()) || localTime(date.toISOString()) !== local) throw new Error('截止时间无效，请重新选择');
  return date.toISOString();
}

export function cleanWords(text: string): string[] {
  const words = [...new Set(text.replace(/^\uFEFF/, '').split(/\r?\n/).map(word => word.trim()).filter(Boolean))];
  if (!words.length) throw new Error('每个词组至少需要一个非空候选');
  if (words.length > 2000 || words.some(word => word.length > 100)) throw new Error('每组最多 2000 个候选，每个候选最多 100 字符');
  return words;
}

export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
