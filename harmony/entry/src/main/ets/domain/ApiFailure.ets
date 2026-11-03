interface ErrorDetail { code?: string; message?: string }
interface ErrorBody { error?: ErrorDetail }

export type RecoveryAction = '' | 'reload' | 'login';

export class ApiFailure extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Gateways may return HTML or a malformed JSON body. Status remains usable for
// recovery even when the server's optional explanation cannot be read.
export function responseFailure(status: number, raw: string): ApiFailure {
  let code = '';
  let message = status === 401 ? '登录已过期，请重新登录' : status === 409
    ? '内容已发生变化，请刷新后重新编辑' : status === 429
      ? '操作太频繁，请稍后再试' : '服务暂时不可用，请稍后重试';
  try {
    const body = JSON.parse(raw) as ErrorBody;
    if (body !== null && typeof body === 'object' && body.error !== null && typeof body.error === 'object') {
      if (typeof body.error.code === 'string') code = body.error.code;
      if (typeof body.error.message === 'string' && body.error.message.trim().length > 0) message = body.error.message;
    }
  } catch (error) { /* Keep status-specific recovery for non-JSON responses. */ }
  return new ApiFailure(status, code, message);
}

export function recoveryAction(error: Error): RecoveryAction {
  if (!(error instanceof ApiFailure)) return '';
  if (error.status === 401) return 'login';
  if (error.status === 403 || error.status === 404 || error.status === 409) return 'reload';
  return '';
}
