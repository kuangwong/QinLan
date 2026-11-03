import type { PoolClient } from 'pg';
import { rows } from './db.js';

export interface ListRow {
  id: string; name: string; owner_id: string; version: number; invite_hash: string | null; invite_expires: Date | null;
}
export interface TaskRow {
  id: string; list_id: string; title: string; note: string; assignee: string | null; due: Date | null;
  done: boolean; version: number; created_at: Date;
}
export interface LibraryRow { id: string; owner_id: string; name: string; mode: 'full' | 'combine'; slots: string[][]; version: number }
interface RecordRow {
  id: string; owner_id: string; name: string; mode: 'full' | 'combine'; source: string;
  date: string; saved_at: Date; version: number; shared_to: string[];
}

export async function snapshot(db: PoolClient, userId: string) {
  const lists = await rows<ListRow & { members: string[] }>(db, `
    SELECT l.*, array(SELECT user_id FROM members WHERE list_id=l.id ORDER BY user_id) AS members
    FROM lists l JOIN members m ON m.list_id=l.id WHERE m.user_id=$1 ORDER BY l.id`, [userId]);
  const listIds = lists.map(list => list.id);
  const tasks = await rows<TaskRow>(db, 'SELECT * FROM tasks WHERE list_id=ANY($1::uuid[]) ORDER BY created_at,id', [listIds]);
  const libraries = await rows<LibraryRow>(db, 'SELECT * FROM libraries WHERE owner_id=$1 ORDER BY id', [userId]);
  const records = await rows<RecordRow>(db, `
    SELECT r.id,r.owner_id,r.name,r.mode,r.source,r.archive_date::text AS date,r.saved_at,r.version,
      array(SELECT s.list_id FROM record_shares s WHERE s.record_id=r.id AND s.list_id=ANY($2::uuid[]) ORDER BY s.list_id) AS shared_to
    FROM name_records r WHERE r.owner_id=$1 OR EXISTS(
      SELECT 1 FROM record_shares s JOIN members m ON m.list_id=s.list_id
      WHERE s.record_id=r.id AND m.user_id=$1 AND (SELECT count(*) FROM members WHERE list_id=s.list_id)>1
    ) ORDER BY r.saved_at DESC,r.id`, [userId, listIds]);
  const visiblePeople = new Set([userId, ...lists.flatMap(list => list.members),
    ...tasks.flatMap(task => task.assignee ? [task.assignee] : []), ...records.map(record => record.owner_id)]);
  const people = await rows<{ id: string; name: string }>(db, 'SELECT id,name FROM users WHERE id=ANY($1::uuid[]) ORDER BY id', [[...visiblePeople]]);
  return {
    schema: 1, user: userId, people,
    lists: lists.map(list => ({ id: list.id, name: list.name, owner: list.owner_id, members: list.members,
      version: list.version, invite: '', inviteExpires: list.owner_id === userId ? list.invite_expires?.getTime() || 0 : 0 })),
    tasks: tasks.map(task => ({ id: task.id, listId: task.list_id, title: task.title, note: task.note,
      assignee: task.assignee || '', due: task.due?.toISOString() || '', done: task.done, version: task.version, created: task.created_at.getTime() })),
    libraries: libraries.map(library => ({ id: library.id, name: library.name, mode: library.mode,
      slots: library.slots, owner: library.owner_id, version: library.version })),
    records: records.map(record => ({ id: record.id, name: record.name, date: record.date,
      owner: record.owner_id, savedAt: record.saved_at.toISOString(), sharedTo: record.shared_to,
      // Sharing exposes the name/date snapshot, never the private source library or generation mode.
      mode: record.owner_id === userId ? record.mode : 'full', source: record.owner_id === userId ? record.source : '',
      version: record.owner_id === userId ? record.version : 0 }))
  };
}

export type Snapshot = Awaited<ReturnType<typeof snapshot>>;
