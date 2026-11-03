import { accessSync, constants, readFileSync, rmSync, statSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));

try {
  const args = process.argv.slice(2);
  if (args.some(value => value !== '--device-tests')) throw new Error('仅支持可选参数 --device-tests。');
  const deviceTests = args.includes('--device-tests');
  const target = deviceTests ? 'ohosTest' : 'default';
  if (process.platform === 'win32') throw new Error('Windows 请使用 DevEco Studio 构建；此命令用于 Linux/macOS 官方命令行工具。');
  if (!process.env.HARMONY_COMMAND_LINE_TOOLS || !process.env.JAVA_HOME) {
    throw new Error('请设置 HARMONY_COMMAND_LINE_TOOLS（解压后的 command-line-tools 目录）和 JAVA_HOME（JDK 17 目录）。');
  }
  const tools = resolve(process.env.HARMONY_COMMAND_LINE_TOOLS);
  const javaHome = resolve(process.env.JAVA_HOME);
  const java = join(javaHome, 'bin/java');
  for (const executable of [java, join(tools, 'bin/ohpm'), join(tools, 'bin/hvigorw')]) {
    accessSync(executable, constants.X_OK);
  }
  const sdkHome = process.env.DEVECO_SDK_HOME || join(tools, 'sdk');
  const sdk = JSON.parse(readFileSync(join(sdkHome, 'default/sdk-pkg.json'), 'utf8')).data;
  console.log(`HarmonyOS SDK: ${sdk.displayName}, API ${sdk.apiVersion}, ${sdk.version}`);
  const env = {
    ...process.env,
    JAVA_HOME: javaHome,
    DEVECO_SDK_HOME: sdkHome,
    PATH: [join(javaHome, 'bin'), process.env.PATH || ''].join(delimiter)
  };
  const run = (command, args) => {
    const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} 执行失败（${result.signal || result.status}）`);
  };
  run(java, ['-version']);
  run(join(tools, 'bin/ohpm'), ['install']);
  const artifact = join(root, `entry/build/default/outputs/${target}/entry-${target}-unsigned.hap`);
  // Remove the old test artifact and rebuild without the incremental cache;
  // preserve the application HAP needed alongside it for device installation.
  if (deviceTests) rmSync(artifact, { force: true });
  run(join(tools, 'bin/hvigorw'), [
    '--mode', 'module', '-p', 'product=default', '-p', `module=entry@${target}`,
    ...(deviceTests ? ['assembleHap', '--no-incremental'] : ['clean', 'assembleHap']), '--no-daemon'
  ]);
  if (statSync(artifact).size === 0) throw new Error('构建产物为空。');
  console.log(`未签名${deviceTests ? '设备测试' : '应用'} HAP：${artifact}\n安装前请在 DevEco Studio 配置设备签名。`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
