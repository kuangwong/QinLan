import { AppState } from './Models';
import { copy, decode } from './Codec';
import { seed } from './Seed';

export interface SnapshotStorage {
  read(): Promise<string | undefined>;
  write(value: string): Promise<void>;
}

// Mutations are published only after persistence succeeds. All callers receive copies.
export class LocalStore {
  private writing: boolean = false;
  private storage: SnapshotStorage;
  private state: AppState;

  private constructor(storage: SnapshotStorage, state: AppState) {
    this.storage = storage;
    this.state = state;
  }

  static async open(storage: SnapshotStorage): Promise<LocalStore> {
    const raw = await storage.read();
    const state = raw === undefined ? seed() : decode(raw);
    if (raw === undefined) await storage.write(JSON.stringify(state));
    return new LocalStore(storage, state);
  }

  snapshot(): AppState { return copy(this.state); }

  async update(change: (state: AppState) => void): Promise<AppState> {
    if (this.writing) throw new Error('正在保存，请稍后重试');
    this.writing = true;
    try {
      const next = copy(this.state);
      change(next);
      const checked = copy(next);
      await this.storage.write(JSON.stringify(checked));
      this.state = checked;
      return this.snapshot();
    } finally {
      this.writing = false;
    }
  }
}
