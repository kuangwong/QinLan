import type { PoolClient } from 'pg';
import { rows } from './db.js';
import type { ListRow, TaskRow } from './state.js';
import { ensure } from './validation.js';

export async function member(db: PoolClient, user: string, listId: string): Promise<ListRow> {
  // Every operation involving membership or assignment locks the parent list.
  // Removal and concurrent assignment therefore cannot leave an invalid assignee.
  const [list] = await rows<ListRow>(db, `SELECT l.* FROM lists l JOIN members m ON m.list_id=l.id
    WHERE l.id=$1 AND m.user_id=$2 FOR UPDATE OF l`, [listId, user]);
  ensure(list, 404, 'NOT_FOUND', '清单不存在或你已不在此清单中');
  // Membership may have changed while waiting for the list lock under READ COMMITTED.
  const [membership] = await rows(db, 'SELECT 1 FROM members WHERE list_id=$1 AND user_id=$2', [listId, user]);
  ensure(membership, 404, 'NOT_FOUND', '清单不存在或你已不在此清单中');
  return list;
}

export async function owner(db: PoolClient, user: string, listId: string): Promise<ListRow> {
  const list = await member(db, user, listId);
  ensure(list.owner_id === user, 403, 'FORBIDDEN', '只有清单所有者可以进行此操作');
  return list;
}

export function matchVersion(actual: number, expected: number): void {
  ensure(actual === expected, 409, 'CONFLICT', '内容已被其他成员修改，请刷新后重新编辑');
}

export async function assignment(db: PoolClient, listId: string, user: string): Promise<void> {
  if (!user) return;
  const [valid] = await rows(db, 'SELECT 1 FROM members WHERE list_id=$1 AND user_id=$2', [listId, user]);
  ensure(valid, 422, 'INVALID_ASSIGNEE', '负责人必须是当前清单成员');
}

export async function lockedTask(db: PoolClient, user: string, id: string, version: number): Promise<TaskRow> {
  const [initial] = await rows<TaskRow>(db, 'SELECT * FROM tasks WHERE id=$1', [id]);
  ensure(initial, 404, 'NOT_FOUND', '待办不存在');
  await member(db, user, initial.list_id);
  const [task] = await rows<TaskRow>(db, 'SELECT * FROM tasks WHERE id=$1 FOR UPDATE', [id]);
  ensure(task, 404, 'NOT_FOUND', '待办已被删除，请刷新');
  matchVersion(task.version, version);
  return task;
}
