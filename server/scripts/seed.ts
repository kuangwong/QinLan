import { Pool } from 'pg';
import { buildApp } from '../src/app.js';

if (!process.env.DATABASE_URL || !process.env.DEMO_PASSWORD) throw new Error('请设置 DATABASE_URL 和至少 8 字符的 DEMO_PASSWORD');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = await buildApp({ pool, rateLimit: false });
try {
  for (const [username, name] of [['xiaoman', '林小满'], ['yizhou', '陈一舟']]) {
    const result = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username, name, password: process.env.DEMO_PASSWORD } });
    if (![201, 409].includes(result.statusCode)) throw new Error(result.body);
    if (result.statusCode === 201) {
      // Seeding must not leave an unused, long-lived login session.
      await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { authorization: `Bearer ${result.json().token}` } });
    }
    console.log(`${username}: ${result.statusCode === 201 ? '已创建' : '已存在，保留原数据'}`);
  }
} finally { await app.close(); await pool.end(); }
