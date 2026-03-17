import { Button } from "@/components/ui/button";

export default function CalendarPage() {
  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">日历 / 日程</h1>
        <p className="text-sm text-muted-foreground">
          这是一个测试页，用来确认莫兰迪主题与底部导航的整体观感。
        </p>
      </header>

      <section className="rounded-2xl border border-border/70 bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">今天</div>
            <div className="text-xs text-muted-foreground">
              留白更多、颜色更柔和、阴影更克制
            </div>
          </div>
          <Button className="rounded-2xl">新增日程</Button>
        </div>
      </section>
    </main>
  );
}

