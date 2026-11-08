import { Pool } from 'pg';
import { buildApp } from './app.js';
import { assertMigrated } from './db.js';

if (!process.env.DATABASE_URL) throw new Error('请配置 DATABASE_URL，运行 pnpm migrate 后再启动');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const app = await buildApp({ pool, logger: true, origins: process.env.CORS_ORIGINS?.split(',').filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === '1' });
// Idle clients emit errors when PostgreSQL restarts; without a listener Node
// exits and every database restart would take the API down with it.
pool.on('error', error => {
  app.log.error({ code: (error as { code?: string }).code, message: error.message }, 'PostgreSQL pool error');
});
const close = async () => { await app.close(); await pool.end(); };
process.once('SIGTERM', () => { close().catch(() => { process.exitCode = 1; }); });
process.once('SIGINT', () => { close().catch(() => { process.exitCode = 1; }); });
try {
  await assertMigrated(pool);
  await app.listen({ host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 3000) });
} catch (error) { app.log.error(error); await close(); process.exitCode = 1; }
