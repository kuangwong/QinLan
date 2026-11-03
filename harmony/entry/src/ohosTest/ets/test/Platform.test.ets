import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@ohos/hypium';
import { abilityDelegatorRegistry } from '@kit.TestKit';
import { common } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { FileStorage } from '../../../main/ets/services/FileStorage';
import { AssetSessionVault } from '../../../main/ets/services/AssetSessionVault';
import { LocalStore } from '../../../main/ets/domain/LocalStore';
import { RemoteSession } from '../../../main/ets/domain/OnlineClient';
import { AppState, TaskList } from '../../../main/ets/domain/Models';
import { Rules } from '../../../main/ets/domain/Rules';

export default function platformTests(): void {
  describe('ShiriPlatform', () => {
    let context: common.Context;
    let storage: FileStorage;
    let vault: AssetSessionVault;
    let fileName = '';
    let filePath = '';
    let alias = '';

    beforeAll(() => {
      context = abilityDelegatorRegistry.getAbilityDelegator().getAppContext();
      const id = util.generateRandomUUID();
      // Dedicated random names keep real snapshots and credentials untouched.
      fileName = `shiri-test-${id}.json`;
      filePath = `${context.filesDir}/${fileName}`;
      storage = new FileStorage(context, fileName);
      alias = `shiri-test-session-${id}`;
      vault = new AssetSessionVault(alias);
    });

    beforeEach(() => {
      if (fs.accessSync(filePath)) fs.unlinkSync(filePath);
      if (fs.accessSync(`${filePath}.pending`)) fs.unlinkSync(`${filePath}.pending`);
    });

    afterAll(async () => {
      try { await vault.clear(); }
      finally {
        if (fs.accessSync(filePath)) fs.unlinkSync(filePath);
        if (fs.accessSync(`${filePath}.pending`)) fs.unlinkSync(`${filePath}.pending`);
      }
    });

    it('private_snapshot_round_trip_replacement_and_unicode', 0, async () => {
      expect(await storage.read()).assertUndefined();
      const first = JSON.stringify({ title: '拾日🌿', note: '中文\n与换行' });
      await storage.write(first);
      expect(await new FileStorage(context, fileName).read()).assertEqual(first);
      await storage.write('{}');
      expect(await storage.read()).assertEqual('{}');
      expect(fs.accessSync(`${filePath}.pending`)).assertFalse();
    });

    it('local_store_reopens_actual_disk_and_rejects_failed_mutation', 0, async () => {
      const store = await LocalStore.open(storage);
      const changed = await store.update((state: AppState) => Rules.createList(state, 'device-list', '设备清单'));
      const reopened = await LocalStore.open(new FileStorage(context, fileName));
      expect(JSON.stringify(reopened.snapshot())).assertEqual(JSON.stringify(changed));
      const before = await storage.read();
      let rejected = false;
      try { await store.update((state: AppState) => { state.user = 'not-a-member'; }); }
      catch (error) { rejected = true; }
      expect(rejected).assertTrue();
      expect(await storage.read()).assertEqual(before);
    });

    it('failed_disk_write_keeps_the_last_committed_snapshot_and_allows_retry', 0, async () => {
      const store = await LocalStore.open(storage);
      const before = await storage.read();
      // A directory where the temporary file belongs forces a real open error.
      fs.mkdirSync(`${filePath}.pending`);
      let rejected = false;
      try {
        await store.update((state: AppState) => Rules.createList(state, 'retry-list', '稍后重试'));
      } catch (error) { rejected = true; }
      finally { fs.rmdirSync(`${filePath}.pending`); }
      expect(rejected).assertTrue();
      expect(await storage.read()).assertEqual(before);
      expect(store.snapshot().lists.some((list: TaskList) => list.id === 'retry-list')).assertFalse();
      const saved = await store.update((state: AppState) => Rules.createList(state, 'retry-list', '稍后重试'));
      expect(saved.lists.some((list: TaskList) => list.id === 'retry-list')).assertTrue();
    });

    it('interrupted_temporary_write_does_not_replace_the_committed_file', 0, async () => {
      await storage.write('{"committed":true}');
      const temporary = fs.openSync(`${filePath}.pending`, fs.OpenMode.CREATE | fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC);
      try { fs.writeSync(temporary.fd, '{partial'); } finally { fs.closeSync(temporary); }
      const reopened = new FileStorage(context, fileName);
      expect(await reopened.read()).assertEqual('{"committed":true}');
      await reopened.write('{"recovered":true}');
      expect(await reopened.read()).assertEqual('{"recovered":true}');
      expect(fs.accessSync(`${filePath}.pending`)).assertFalse();
    });

    it('corrupt_snapshot_is_retained_instead_of_reseeded', 0, async () => {
      await storage.write('{corrupt');
      let rejected = false;
      try { await LocalStore.open(storage); } catch (error) { rejected = true; }
      expect(rejected).assertTrue();
      expect(await storage.read()).assertEqual('{corrupt');
    });

    it('asset_vault_persists_overwrites_and_removes_a_dedicated_secret', 0, async () => {
      expect(await vault.read()).assertUndefined();
      const session = new RemoteSession();
      session.baseUrl = 'https://shiri.example.com'; session.userId = 'platform-test';
      session.token = 'a'.repeat(64); session.expiresAt = '2030-01-01T00:00:00.000Z';
      await vault.write(session);
      expect(JSON.stringify(await new AssetSessionVault(alias).read())).assertEqual(JSON.stringify(session));
      session.token = 'b'.repeat(64);
      await vault.write(session);
      expect((await vault.read())?.token).assertEqual(session.token);
      await vault.clear();
      expect(await vault.read()).assertUndefined();
      await vault.clear();
    });
  });
}
