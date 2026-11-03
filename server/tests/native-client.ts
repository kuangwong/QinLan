import ts from 'typescript';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export async function nativeClient(directory: string) {
  const destination = join(directory, 'native-domain'); await mkdir(destination);
  const source = fileURLToPath(new URL('../../harmony/entry/src/main/ets/domain/', import.meta.url));
  for (const name of (await readdir(source)).filter(name => name.endsWith('.ets'))) {
    const input = (await readFile(join(source, name), 'utf8')).replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'");
    const output = ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    await writeFile(join(destination, name.replace(/\.ets$/, '.mjs')), output);
  }
  return {
    ...await import(pathToFileURL(join(destination, 'OnlineClient.mjs')).href),
    ...await import(pathToFileURL(join(destination, 'ApiFailure.mjs')).href)
  };
}
