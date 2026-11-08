import { Pool } from 'pg';
import { migrate } from './db.js';

if (!process.env.DATABASE_URL) throw new Error('请配置 DATABASE_URL');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try { await migrate(pool); console.log('数据库迁移完成'); }
finally { await pool.end(); }
