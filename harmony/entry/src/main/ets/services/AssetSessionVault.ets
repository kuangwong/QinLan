import { asset } from '@kit.AssetStoreKit';
import { util } from '@kit.ArkTS';
import { BusinessError } from '@kit.BasicServicesKit';
import { RemoteSession, SessionVault } from '../domain/OnlineClient';

export class AssetSessionVault implements SessionVault {
  private alias: string;

  constructor(alias: string = 'shiri-session-v1') {
    this.alias = alias;
  }

  private query(): asset.AssetMap {
    const query: asset.AssetMap = new Map();
    query.set(asset.Tag.ALIAS, new util.TextEncoder().encodeInto(this.alias));
    return query;
  }

  async read(): Promise<RemoteSession | undefined> {
    const query = this.query();
    query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
    try {
      const items = await asset.query(query);
      if (items.length === 0) return undefined;
      const bytes = items[0].get(asset.Tag.SECRET) as Uint8Array;
      return JSON.parse(util.TextDecoder.create('utf-8', { fatal: true }).decodeToString(bytes)) as RemoteSession;
    } catch (error) {
      if ((error as BusinessError).code === asset.ErrorCode.NOT_FOUND) return undefined;
      throw new Error('无法读取设备安全存储中的登录信息，请解锁设备后重试');
    }
  }

  async write(session: RemoteSession): Promise<void> {
    const attributes = this.query();
    attributes.set(asset.Tag.SECRET, new util.TextEncoder().encodeInto(JSON.stringify(session)));
    attributes.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_FIRST_UNLOCKED);
    attributes.set(asset.Tag.SYNC_TYPE, asset.SyncType.NEVER);
    attributes.set(asset.Tag.CONFLICT_RESOLUTION, asset.ConflictResolution.OVERWRITE);
    await asset.add(attributes);
  }

  async clear(): Promise<void> {
    try { await asset.remove(this.query()); }
    catch (error) { if ((error as BusinessError).code !== asset.ErrorCode.NOT_FOUND) throw error as Error; }
  }
}
