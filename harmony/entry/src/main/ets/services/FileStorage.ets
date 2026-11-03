import { common } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { SnapshotStorage } from '../domain/LocalStore';

// Word libraries can exceed Preferences' per-value limit. Keep the snapshot in
// the application's private files directory; replace it only after fsync.
export class FileStorage implements SnapshotStorage {
  private path: string;

  constructor(context: common.Context, fileName: string = 'shiri-v1.json') {
    if (!/^[a-zA-Z0-9_-]+\.json$/.test(fileName)) throw new Error('快照文件名无效');
    this.path = `${context.filesDir}/${fileName}`;
  }

  async read(): Promise<string | undefined> {
    if (!fs.accessSync(this.path)) return undefined;
    return fs.readTextSync(this.path);
  }

  async write(value: string): Promise<void> {
    const temporary = `${this.path}.pending`;
    const file = fs.openSync(temporary, fs.OpenMode.CREATE | fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC);
    try {
      const bytes = new util.TextEncoder().encodeInto(value);
      if (fs.writeSync(file.fd, bytes.buffer) !== bytes.byteLength) throw new Error('写入未完成');
      fs.fsyncSync(file.fd);
    } finally {
      fs.closeSync(file);
    }
    // An interruption before this rename leaves the previous snapshot intact.
    fs.renameSync(temporary, this.path);
  }
}
