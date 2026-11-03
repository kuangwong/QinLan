import { CalendarDay, calendarDays, dateKey } from '../domain/Models';

@Component
export struct MonthCalendar {
  @StorageLink('shiriFontScale') private fontScale: number = 1;
  @State private availableWidth: number = 308;
  @Prop year: number = new Date().getFullYear();
  @Prop month: number = new Date().getMonth();
  @Prop selected: string = dateKey();
  @Prop dates: string[] = [];
  onSelect: (day: string) => void = () => {};
  onMove: (offset: number) => void = () => {};

  private contentWidth(): number {
    return Math.max(this.availableWidth, 7 * Math.max(48, Math.ceil(24 * this.fontScale + 8)));
  }

  build() {
    Column({ space: 14 }) {
      Row({ space: 8 }) {
        Button('‹').onClick(() => this.onMove(-1)).accessibilityText('上个月')
          .backgroundColor('#F1F4EE').fontColor('#476F58').constraintSize({ minWidth: 48, minHeight: 48 })
        Text(`${this.year} 年 ${this.month + 1} 月`).fontSize(18).fontWeight(FontWeight.Medium).layoutWeight(1).textAlign(TextAlign.Center)
        Button('›').onClick(() => this.onMove(1)).accessibilityText('下个月')
          .backgroundColor('#F1F4EE').fontColor('#476F58').constraintSize({ minWidth: 48, minHeight: 48 })
      }.width('100%')
      Scroll() {
        Column({ space: 4 }) {
          Row() {
            ForEach(['一', '二', '三', '四', '五', '六', '日'], (label: string) => {
              Text(label).fontSize(12).fontColor('#7A857A').layoutWeight(1).textAlign(TextAlign.Center)
                .accessibilityText(`星期${label}`)
            }, (label: string) => label)
          }.width('100%').padding({ bottom: 8 })
          ForEach([0, 1, 2, 3, 4, 5], (week: number) => {
            Row() {
              ForEach(calendarDays(this.year, this.month).slice(week * 7, week * 7 + 7), (cell: CalendarDay) => {
                Button({ type: ButtonType.Normal }) {
                  Column({ space: 4 }) {
                    Text(`${cell.day}`).fontSize(15)
                      .fontColor(cell.key === this.selected ? '#FFFFFF' : cell.inMonth ? '#343B36' : '#7A857A')
                    Circle().width(4).height(4)
                      .fill(this.dates.includes(cell.key) ? cell.key === this.selected ? '#FFFFFF' : '#8B7AA8' : Color.Transparent)
                  }.padding({ top: 8, bottom: 8 }).width('100%')
                }.layoutWeight(1).constraintSize({ minHeight: 48 }).padding(0).borderRadius(12)
                  .backgroundColor(cell.key === this.selected ? '#476F58' : cell.key === dateKey() ? '#E9EFE4' : Color.Transparent)
                  .onClick(() => this.onSelect(cell.key)).id(`calendar-${cell.key}`)
                  .accessibilityGroup(true).accessibilitySelected(cell.key === this.selected)
                  .accessibilityText(`${cell.key}${cell.key === dateKey() ? ' 今天' : ''}${this.dates.includes(cell.key) ? ' 有名字记录' : ' 无名字记录'}`)
              }, (cell: CalendarDay) => cell.key)
            }.width('100%')
          }, (week: number) => `${week}`)
        }.width(this.contentWidth())
      }.scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Auto).width('100%')
        .onAreaChange((_previous: Area, area: Area) => { this.availableWidth = Number(area.width); })
        .accessibilityDescription('日历可横向滚动查看整周日期')
    }.padding(16).backgroundColor('#FFFFFF').borderRadius(20).width('100%')
  }
}
