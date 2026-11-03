import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

export type Database = Pool | PoolClient;

export async function rows<T extends QueryResultRow>(db: Database, sql: string, values: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, values)).rows;
}

export async function transaction<T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function migrate(pool: Pool): Promise<void> {
  const directory = fileURLToPath(new URL('../migrations/', import.meta.url));
  await transaction(pool, async client => {
    // Serialise concurrent startups before checking or applying migrations.
    await client.query('SELECT pg_advisory_xact_lock(74301921)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const applied = new Set((await rows<{ name: string }>(client, 'SELECT name FROM schema_migrations')).map(row => row.name));
    for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
      if (!applied.has(name)) {
        await client.query(await readFile(join(directory, name), 'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
      }
    }
  });
}

export async function assertMigrated(pool: Pool): Promise<void> {
  const directory = fileURLToPath(new URL('../migrations/', import.meta.url));
  const expected = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
  let applied: Set<string>;
  try {
    applied = new Set((await rows<{ name: string }>(pool, 'SELECT name FROM schema_migrations')).map(row => row.name));
  } catch (error) {
    if ((error as { code?: string }).code === '42P01') throw new Error('数据库尚未初始化，请先运行 pnpm migrate');
    throw error;
  }
  const pending = expected.filter(name => !applied.has(name));
  if (pending.length > 0) throw new Error(`数据库缺少迁移 ${pending.join(', ')}，请先运行 pnpm migrate`);
}
