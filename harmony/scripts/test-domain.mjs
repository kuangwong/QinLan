import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const tsc = require.resolve('typescript/bin/tsc');
const temporary = await mkdtemp(join(tmpdir(), 'shiri-domain-'));
try {
  const source = join(root, 'entry/src/main/ets/domain');
  const files = (await readdir(source)).filter(name => name.endsWith('.ets'));
  for (const name of files) {
    const text = (await readFile(join(source, name), 'utf8'))
      .replace(/from '(\.\/[^']+)'/g, "from '$1.js'");
    await writeFile(join(temporary, name.replace(/\.ets$/, '.ts')), text);
  }
  await writeFile(join(temporary, 'package.json'), '{"type":"module"}');
  await writeFile(join(temporary, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true,
      noUnusedLocals: true, noUnusedParameters: true, outDir: 'out', skipLibCheck: true,
      types: []
    }, include: ['*.ts']
  }));
  const compiled = spawnSync(process.execPath, [tsc, '-p', temporary], { cwd: root, stdio: 'inherit' });
  if (compiled.status !== 0) process.exitCode = compiled.status || 1;
  else {
    const tests = (await readdir(join(root, 'tests'))).filter(name => name.endsWith('.test.mjs'));
    const result = spawnSync(process.execPath, ['--test', ...tests.map(name => resolve(root, 'tests', name))], {
      cwd: root, stdio: 'inherit', env: { ...process.env, SHIRI_DOMAIN_DIR: join(temporary, 'out') }
    });
    process.exitCode = result.status || 0;
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
