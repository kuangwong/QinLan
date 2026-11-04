import { randomBytes, randomUUID, createHash } from 'node:crypto';
import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import argon2 from 'argon2';
import { z, ZodError } from 'zod';
import { Pool } from 'pg';
import { rows, transaction } from './db.js';
import { snapshot, type LibraryRow, type ListRow } from './state.js';
import { assignment, lockedTask, matchVersion, member, owner } from './permissions.js';
import { ApiError, ensure, credentials, registration, id, expected, listInput, taskInput, taskUpdate,
  libraryInput, libraryUpdate, recordInput, sharing, invitation } from './validation.js';

declare module 'fastify' {
  interface FastifyRequest { userId: string; sessionHash: string }
  interface FastifyContextConfig { public?: boolean }
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const pathId = (request: FastifyRequest) => id.parse((request.params as { id: string }).id);
const pathCode = (request: FastifyRequest) => invitation.parse({ code: (request.params as { code: string }).code }).code;
const passwordOptions = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
export const hashPassword = (password: string) => argon2.hash(password, passwordOptions);

interface AppOptions { pool: Pool; logger?: boolean; rateLimit?: boolean; origins?: string[]; trustProxy?: number }

export async function buildApp(options: AppOptions) {
  const { pool } = options;
  const app = Fastify({ logger: options.logger ? { redact: ['req.headers.authorization'] } : false,
    bodyLimit: 4 * 1024 * 1024, trustProxy: options.trustProxy ?? false });
  await app.register(cors, { origin: options.origins || ['http://localhost:5173', 'http://127.0.0.1:5173'] });
  if (options.rateLimit !== false) await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  const dummyHash = await hashPassword(randomBytes(32).toString('hex'));
  app.decorateRequest('userId', ''); app.decorateRequest('sessionHash', '');
  app.addHook('onSend', async (_request, reply, payload) => { reply.header('Cache-Control', 'no-store'); return payload; });
  app.addHook('onRequest', async request => {
    if (request.method === 'OPTIONS' || request.routeOptions.config.public) return;
    const token = request.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    ensure(token, 401, 'UNAUTHENTICATED', '请先登录');
    const tokenHash = hash(token);
    const [session] = await rows<{ user_id: string }>(pool, 'SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()', [tokenHash]);
    ensure(session, 401, 'SESSION_EXPIRED', '登录已过期，请重新登录');
    request.userId = session.user_id; request.sessionHash = tokenHash;
  });
  app.setErrorHandler((error: Error & { code?: string; statusCode?: number }, request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: '输入格式不正确，请检查字段内容', fields: error.issues.map(issue => issue.path.join('.')) } });
    if (error instanceof ApiError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    if (error.code === '23505') return reply.code(409).send({ error: { code: 'ALREADY_EXISTS', message: '名称或记录已存在，请刷新后重试' } });
    if (error.code === '40P01' || error.code === '40001') return reply.code(409).send({ error: { code: 'CONFLICT', message: '内容正在更新，请刷新后重试' } });
    if (error.statusCode && error.statusCode < 500) return reply.code(error.statusCode).send({ error: { code: 'REQUEST_REJECTED', message: error.statusCode === 429 ? '操作太频繁，请稍后再试' : '请求格式或大小不符合要求' } });
    request.log.error(error);
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用，请稍后重试' } });
  });

  async function session(userId: string) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 86400000);
    await pool.query('DELETE FROM sessions WHERE expires_at<=now()');
    await pool.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,$3)', [hash(token), userId, expiresAt]);
    return { token, expiresAt: expiresAt.toISOString(), userId };
  }

  const authConfig = { public: true, rateLimit: { max: 8, timeWindow: '1 minute' } };
  app.get('/health', { config: { public: true } }, async () => {
    await pool.query('SELECT 1'); return { status: 'ok' };
  });
  app.post('/api/v1/auth/register', { config: authConfig }, async (request, reply) => {
    const input = registration.parse(request.body); const userId = randomUUID();
    const passwordHash = await hashPassword(input.password);
    await transaction(pool, async db => {
      await db.query('INSERT INTO users(id,username,name,password_hash) VALUES ($1,$2,$3,$4)', [userId, input.username, input.name, passwordHash]);
      const listId = randomUUID();
      await db.query('INSERT INTO lists(id,name,owner_id) VALUES ($1,$2,$3)', [listId, '生活的小事', userId]);
      await db.query('INSERT INTO members(list_id,user_id) VALUES ($1,$2)', [listId, userId]);
      await db.query('INSERT INTO libraries(id,owner_id,name,mode,slots) VALUES ($1,$2,$3,$4,$5)',
        [randomUUID(), userId, '森林来信', 'combine', JSON.stringify([['慢慢的', '听雨的', '追风的'], ['小水獭', '小狐狸', '云朵']])]);
      await db.query('INSERT INTO libraries(id,owner_id,name,mode,slots) VALUES ($1,$2,$3,$4,$5)',
        [randomUUID(), userId, '温柔宇宙', 'full', JSON.stringify([['月亮邮差', '山间来信', '晚风收藏家']])]);
    });
    return reply.code(201).send(await session(userId));
  });
  app.post('/api/v1/auth/login', { config: authConfig }, async request => {
    const input = credentials.parse(request.body);
    const [user] = await rows<{ id: string; password_hash: string }>(pool, 'SELECT id,password_hash FROM users WHERE username=$1', [input.username]);
    const valid = await argon2.verify(user?.password_hash || dummyHash, input.password);
    ensure(user && valid, 401, 'INVALID_CREDENTIALS', '用户名或密码不正确');
    return session(user.id);
  });
  app.post('/api/v1/auth/logout', async request => {
    await pool.query('DELETE FROM sessions WHERE token_hash=$1', [request.sessionHash]); return { ok: true };
  });
  app.get('/api/v1/me', async request => (await rows(pool, 'SELECT id,username,name FROM users WHERE id=$1', [request.userId]))[0]);
  const getState = (user: string) => transaction(pool, async db => {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    return snapshot(db, user);
  });
  app.get('/api/v1/state', async request => getState(request.userId));
  app.get('/api/v1/lists', async request => (await getState(request.userId)).lists);
  app.post('/api/v1/lists', async (request, reply) => {
    const input = listInput.extend({ id: id.optional() }).parse(request.body); const listId = input.id || randomUUID();
    await transaction(pool, async db => {
      await db.query('INSERT INTO lists(id,name,owner_id) VALUES ($1,$2,$3)', [listId, input.name, request.userId]);
      await db.query('INSERT INTO members(list_id,user_id) VALUES ($1,$2)', [listId, request.userId]);
    });
    return reply.code(201).send({ id: listId, version: 1 });
  });
  app.patch('/api/v1/lists/:id', async request => {
    const listId = pathId(request); const input = listInput.extend({ version: z.number().int().positive() }).parse(request.body);
    return transaction(pool, async db => {
      const list = await owner(db, request.userId, listId); matchVersion(list.version, input.version);
      await db.query('UPDATE lists SET name=$2,version=version+1 WHERE id=$1', [listId, input.name]);
      return { id: listId, version: list.version + 1 };
    });
  });
  app.delete('/api/v1/lists/:id', async request => {
    const listId = pathId(request); const input = expected.parse(request.body);
    await transaction(pool, async db => {
      const list = await owner(db, request.userId, listId); matchVersion(list.version, input.version);
      await db.query('DELETE FROM lists WHERE id=$1', [listId]);
    }); return { ok: true };
  });
  app.post('/api/v1/lists/:id/invitation', async request => {
    const listId = pathId(request); const input = expected.parse(request.body);
    const code = `SHIRI-${randomBytes(12).toString('hex').toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 7 * 86400000);
    return transaction(pool, async db => {
      const list = await owner(db, request.userId, listId); matchVersion(list.version, input.version);
      await db.query('UPDATE lists SET invite_hash=$2,invite_expires=$3,version=version+1 WHERE id=$1', [listId, hash(code), expiresAt]);
      return { code, expiresAt: expiresAt.toISOString(), version: list.version + 1 };
    });
  });
  app.delete('/api/v1/lists/:id/invitation', async request => {
    const listId = pathId(request); const input = expected.parse(request.body);
    return transaction(pool, async db => {
      const list = await owner(db, request.userId, listId); matchVersion(list.version, input.version);
      await db.query('UPDATE lists SET invite_hash=NULL,invite_expires=NULL,version=version+1 WHERE id=$1', [listId]);
      return { version: list.version + 1 };
    });
  });
  app.get('/api/v1/invitations/:code', async request => {
    const code = pathCode(request);
    const [list] = await rows<{ id: string; name: string; member_count: number; already_joined: boolean }>(pool, `
      SELECT l.id,l.name,(SELECT count(*)::int FROM members WHERE list_id=l.id) AS member_count,
      EXISTS(SELECT 1 FROM members WHERE list_id=l.id AND user_id=$2) AS already_joined
      FROM lists l WHERE invite_hash=$1 AND invite_expires>now()`, [hash(code), request.userId]);
    ensure(list, 404, 'INVITE_INVALID', '邀请码不存在、已撤销或已过期');
    return { id: list.id, name: list.name, memberCount: list.member_count, alreadyJoined: list.already_joined };
  });
  app.post('/api/v1/invitations/:code/join', async request => {
    const code = pathCode(request);
    return transaction(pool, async db => {
      const [list] = await rows<ListRow>(db, 'SELECT * FROM lists WHERE invite_hash=$1 FOR UPDATE', [hash(code)]);
      ensure(list && list.invite_expires && list.invite_expires.getTime() > Date.now(), 404, 'INVITE_INVALID', '邀请码不存在、已撤销或已过期');
      ensure(list.invite_hash === hash(code), 404, 'INVITE_INVALID', '邀请已失效');
      const [existing] = await rows(db, 'SELECT 1 FROM members WHERE list_id=$1 AND user_id=$2', [list.id, request.userId]);
      ensure(!existing, 409, 'ALREADY_MEMBER', '你已经加入了这份清单');
      await db.query('INSERT INTO members(list_id,user_id) VALUES ($1,$2)', [list.id, request.userId]);
      await db.query('UPDATE lists SET version=version+1 WHERE id=$1', [list.id]);
      return { id: list.id, version: list.version + 1 };
    });
  });
  app.delete('/api/v1/lists/:id/members/:userId', async request => {
    const listId = pathId(request); const userId = id.parse((request.params as { userId: string }).userId);
    const input = expected.parse(request.body);
    return transaction(pool, async db => {
      const list = await member(db, request.userId, listId); matchVersion(list.version, input.version);
      ensure(userId === request.userId || list.owner_id === request.userId, 403, 'FORBIDDEN', '只有所有者能移除其他成员');
      ensure(userId !== list.owner_id, 422, 'OWNER_CANNOT_LEAVE', '所有者需要先转让所有权或删除清单');
      const removed = await db.query('DELETE FROM members WHERE list_id=$1 AND user_id=$2 RETURNING user_id', [listId, userId]);
      ensure(removed.rowCount, 404, 'NOT_FOUND', '成员已不在清单中');
      await db.query('UPDATE tasks SET assignee=NULL,version=version+1 WHERE list_id=$1 AND assignee=$2 AND NOT done', [listId, userId]);
      await db.query('UPDATE lists SET version=version+1 WHERE id=$1', [listId]);
      return { version: list.version + 1 };
    });
  });
  app.post('/api/v1/lists/:id/transfer', async request => {
    const listId = pathId(request); const input = expected.extend({ userId: id }).parse(request.body);
    return transaction(pool, async db => {
      const list = await owner(db, request.userId, listId); matchVersion(list.version, input.version);
      ensure(input.userId !== request.userId, 422, 'INVALID_OWNER', '请选择另一位当前成员');
      await assignment(db, listId, input.userId);
      await db.query('UPDATE lists SET owner_id=$2,invite_hash=NULL,invite_expires=NULL,version=version+1 WHERE id=$1', [listId, input.userId]);
      return { version: list.version + 1 };
    });
  });

  app.get('/api/v1/tasks', async request => {
    const query = z.object({ listId: id.optional(), status: z.enum(['pending', 'done', 'all']).default('all'),
      assignee: z.union([id, z.literal('')]).optional(), q: z.string().max(100).default('') }).strict().parse(request.query);
    const state = await getState(request.userId);
    if (query.listId) ensure(state.lists.some(list => list.id === query.listId), 404, 'NOT_FOUND', '清单不存在');
    return state.tasks.filter(task => (!query.listId || task.listId === query.listId) &&
      (query.status === 'all' || task.done === (query.status === 'done')) &&
      (query.assignee === undefined || task.assignee === query.assignee) && `${task.title} ${task.note}`.toLowerCase().includes(query.q.toLowerCase()))
      .sort((a, b) => Number(a.done) - Number(b.done) || (a.due || '9999').localeCompare(b.due || '9999') || a.created - b.created);
  });
  app.post('/api/v1/lists/:id/tasks', async (request, reply) => {
    const listId = pathId(request); const input = taskInput.extend({ id: id.optional() }).parse(request.body); const taskId = input.id || randomUUID();
    await transaction(pool, async db => {
      await member(db, request.userId, listId); await assignment(db, listId, input.assignee);
      await db.query('INSERT INTO tasks(id,list_id,title,note,assignee,due) VALUES ($1,$2,$3,$4,$5,$6)',
        [taskId, listId, input.title, input.note, input.assignee || null, input.due || null]);
    }); return reply.code(201).send({ id: taskId, version: 1 });
  });
  app.patch('/api/v1/tasks/:id', async request => {
    const taskId = pathId(request); const input = taskUpdate.parse(request.body);
    return transaction(pool, async db => {
      const task = await lockedTask(db, request.userId, taskId, input.version);
      if (task.done && !input.done && input.assignee && input.assignee === task.assignee) {
        const [stillMember] = await rows(db, 'SELECT 1 FROM members WHERE list_id=$1 AND user_id=$2', [task.list_id, input.assignee]);
        if (!stillMember) input.assignee = '';
      }
      // A completed task can keep its departed assignee as historical context.
      if (!(input.done && task.done && input.assignee === task.assignee)) await assignment(db, task.list_id, input.assignee);
      await db.query('UPDATE tasks SET title=$2,note=$3,assignee=$4,due=$5,done=$6,version=version+1 WHERE id=$1',
        [taskId, input.title, input.note, input.assignee || null, input.due || null, input.done]);
      return { id: taskId, version: task.version + 1 };
    });
  });
  app.delete('/api/v1/tasks/:id', async request => {
    const taskId = pathId(request); const input = expected.parse(request.body);
    await transaction(pool, async db => {
      await lockedTask(db, request.userId, taskId, input.version); await db.query('DELETE FROM tasks WHERE id=$1', [taskId]);
    }); return { ok: true };
  });

  app.get('/api/v1/libraries', async request => (await getState(request.userId)).libraries);
  app.post('/api/v1/libraries', async (request, reply) => {
    const input = libraryInput.safeExtend({ id: id.optional() }).parse(request.body); const libraryId = input.id || randomUUID();
    const slots = input.slots.map(slot => [...new Set(slot)]);
    await pool.query('INSERT INTO libraries(id,owner_id,name,mode,slots) VALUES ($1,$2,$3,$4,$5)',
      [libraryId, request.userId, input.name, input.mode, JSON.stringify(slots)]);
    return reply.code(201).send({ id: libraryId, version: 1 });
  });
  app.put('/api/v1/libraries/:id', async request => {
    const libraryId = pathId(request); const input = libraryUpdate.parse(request.body);
    return transaction(pool, async db => {
      const [library] = await rows<LibraryRow>(db, 'SELECT * FROM libraries WHERE id=$1 AND owner_id=$2 FOR UPDATE', [libraryId, request.userId]);
      ensure(library, 404, 'NOT_FOUND', '词库不存在'); matchVersion(library.version, input.version);
      await db.query('UPDATE libraries SET name=$2,mode=$3,slots=$4,version=version+1 WHERE id=$1',
        [libraryId, input.data.name, input.data.mode, JSON.stringify(input.data.slots.map(slot => [...new Set(slot)]))]);
      return { id: libraryId, version: library.version + 1 };
    });
  });
  app.delete('/api/v1/libraries/:id', async request => {
    const libraryId = pathId(request); const input = expected.parse(request.body);
    await transaction(pool, async db => {
      const [library] = await rows<LibraryRow>(db, 'SELECT * FROM libraries WHERE id=$1 AND owner_id=$2 FOR UPDATE', [libraryId, request.userId]);
      ensure(library, 404, 'NOT_FOUND', '词库不存在'); matchVersion(library.version, input.version);
      await db.query('DELETE FROM libraries WHERE id=$1', [libraryId]);
    }); return { ok: true };
  });
  app.post('/api/v1/records', async (request, reply) => {
    const input = recordInput.extend({ id: id.optional() }).parse(request.body); const recordId = input.id || randomUUID();
    await pool.query('INSERT INTO name_records(id,owner_id,name,mode,source,archive_date) VALUES ($1,$2,$3,$4,$5,$6)',
      [recordId, request.userId, input.name, input.mode, input.source, input.date]);
    return reply.code(201).send({ id: recordId, version: 1 });
  });
  app.patch('/api/v1/records/:id/shares', async request => {
    const recordId = pathId(request); const input = sharing.parse(request.body);
    return transaction(pool, async db => {
      const [record] = await rows<{ version: number }>(db, 'SELECT version FROM name_records WHERE id=$1 AND owner_id=$2 FOR UPDATE', [recordId, request.userId]);
      ensure(record, 404, 'NOT_FOUND', '记录不存在'); matchVersion(record.version, input.version);
      const listIds = [...new Set(input.listIds)].sort();
      for (const listId of listIds) {
        await member(db, request.userId, listId);
        const [{ count }] = await rows<{ count: number }>(db, 'SELECT count(*)::int AS count FROM members WHERE list_id=$1', [listId]);
        ensure(count > 1, 422, 'NOT_SHARED', '只能分享到当前加入的共享清单');
      }
      await db.query('DELETE FROM record_shares WHERE record_id=$1', [recordId]);
      for (const listId of listIds) await db.query('INSERT INTO record_shares(record_id,list_id) VALUES ($1,$2)', [recordId, listId]);
      await db.query('UPDATE name_records SET version=version+1 WHERE id=$1', [recordId]);
      return { id: recordId, version: record.version + 1 };
    });
  });
  app.delete('/api/v1/records/:id', async request => {
    const recordId = pathId(request); const input = expected.parse(request.body);
    await transaction(pool, async db => {
      const [record] = await rows<{ version: number }>(db, 'SELECT version FROM name_records WHERE id=$1 AND owner_id=$2 FOR UPDATE', [recordId, request.userId]);
      ensure(record, 404, 'NOT_FOUND', '记录不存在'); matchVersion(record.version, input.version);
      await db.query('DELETE FROM name_records WHERE id=$1', [recordId]);
    }); return { ok: true };
  });
  app.get('/api/v1/records', async request => {
    const query = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(), scope: z.union([id, z.literal('mine')]).default('mine') }).strict().parse(request.query);
    const state = await getState(request.userId);
    if (query.scope !== 'mine') ensure(state.lists.some(list => list.id === query.scope), 404, 'NOT_FOUND', '清单不存在');
    return state.records.filter(record => (query.scope === 'mine' ? record.owner === request.userId : record.sharedTo.includes(query.scope)) &&
      (!query.month || record.date.startsWith(query.month)));
  });
  return app;
}
