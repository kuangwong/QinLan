import { Pool } from 'pg';
import { buildApp } from './app.js';
import { assertMigrated } from './db.js';

if (!process.env.DATABASE_URL) throw new Error('请配置 DATABASE_URL，运行 pnpm migrate 后再启动');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.TRUST_PROXY && !['0', '1'].includes(process.env.TRUST_PROXY)) throw new Error('TRUST_PROXY 仅支持 0（直连）或 1（单层受信反向代理）');
const app = await buildApp({ pool, logger: true, origins: process.env.CORS_ORIGINS?.split(',').map(origin => origin.trim()).filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === '1' ? 1 : undefined });
const close = async () => { await app.close(); await pool.end(); };
process.once('SIGTERM', () => { close().catch(() => { process.exitCode = 1; }); });
process.once('SIGINT', () => { close().catch(() => { process.exitCode = 1; }); });
try {
  await assertMigrated(pool);
  await app.listen({ host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 3000) });
} catch (error) { app.log.error(error); await close(); process.exitCode = 1; }
