import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const json = async name => JSON.parse(await readFile(join(root, name), 'utf8'));
const module = (await json('entry/src/main/module.json5')).module;
assert.equal(module.type, 'entry');
assert.equal(module.mainElement, 'EntryAbility');
assert.ok(module.deviceTypes.includes('phone'));
for (const ability of module.abilities) {
  await access(join(root, 'entry/src/main', ability.srcEntry));
}
const pages = await json('entry/src/main/resources/base/profile/main_pages.json');
for (const page of pages.src) await access(join(root, 'entry/src/main/ets', `${page}.ets`));
const profile = await json('build-profile.json5');
assert.equal(profile.app.products[0].runtimeOS, 'HarmonyOS');
assert.equal(profile.modules[0].srcPath, './entry');
const app = (await json('AppScope/app.json5')).app;
assert.equal(app.bundleName, 'com.qinlan.shiri');
for (const prefix of ['AppScope', 'entry/src/main']) {
  const strings = await json(`${prefix}/resources/base/element/string.json`);
  assert.ok(strings.string.some(item => item.name === 'app_name' && item.value === '拾日'));
  await access(join(root, prefix, 'resources/base/media/app_icon.svg'));
}
console.log('工程资源与入口引用检查通过。此检查不编译 ArkUI，也不生成 HAP。');
