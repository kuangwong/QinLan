import { Configuration, UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';

export default class EntryAbility extends UIAbility {
  onCreate(): void { this.updateFontScale(this.context.config); }

  onConfigurationUpdate(configuration: Configuration): void { this.updateFontScale(configuration); }

  private updateFontScale(configuration: Configuration): void {
    if (configuration.fontSizeScale !== undefined) AppStorage.setOrCreate<number>('shiriFontScale', configuration.fontSizeScale);
  }

  onForeground(): void {
    AppStorage.setOrCreate<boolean>('shiriForeground', true);
  }

  onBackground(): void {
    AppStorage.setOrCreate<boolean>('shiriForeground', false);
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    this.loadWindow(windowStage);
  }

  private async loadWindow(windowStage: window.WindowStage): Promise<void> {
    try {
      // Keep content inside the system's status, cutout and navigation areas.
      await windowStage.getMainWindowSync().setWindowLayoutFullScreen(false);
    } catch (error) { console.error('无法设置系统安全区，保留系统默认窗口布局'); }
    windowStage.loadContent('pages/Index');
  }
}
