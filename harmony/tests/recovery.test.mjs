import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const { ApiFailure, responseFailure, recoveryAction } = await import(pathToFileURL(
  join(process.env.SHIRI_DOMAIN_DIR, 'ApiFailure.js')).href);

test('conflicts and removed resources offer reload while invalid sessions require login', () => {
  for (const [status, code, expected] of [
    [409, 'CONFLICT', 'reload'], [409, 'ALREADY_EXISTS', 'reload'],
    [403, 'FORBIDDEN', 'reload'], [404, 'NOT_FOUND', 'reload'],
    [401, 'SESSION_EXPIRED', 'login'], [422, 'INVALID_ASSIGNEE', ''],
    [429, 'REQUEST_REJECTED', ''], [503, 'INTERNAL_ERROR', '']
  ]) {
    const error = responseFailure(status, JSON.stringify({ error: { code, message: '来自服务端的说明' } }));
    assert.ok(error instanceof Error);
    assert.equal(error.status, status); assert.equal(error.code, code);
    assert.equal(error.message, '来自服务端的说明');
    assert.equal(recoveryAction(error), expected);
  }
  assert.equal(recoveryAction(new ApiFailure(0, 'NETWORK_ERROR', '断网')), '');
  assert.equal(recoveryAction(new Error('disk full')), '');
});

test('HTML gateways and malformed error envelopes retain status recovery without crashing', () => {
  for (const raw of ['<html>gateway</html>', '', 'null', '[]', '{"error":null}',
    '{"error":"bad"}', '{"error":{"code":1,"message":42}}', '{"error":{"message":" "}}']) {
    const conflict = responseFailure(409, raw);
    assert.equal(recoveryAction(conflict), 'reload'); assert.match(conflict.message, /重新编辑/);
    const expired = responseFailure(401, raw);
    assert.equal(recoveryAction(expired), 'login'); assert.match(expired.message, /登录/);
  }
});
