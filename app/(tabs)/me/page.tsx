export default function MePage() {
  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">我的 / 里程碑</h1>
        <p className="text-sm text-muted-foreground">
          这里后面会放家庭信息、宝宝档案、里程碑列表等。
        </p>
      </header>

      <section className="rounded-2xl border border-border/70 bg-card p-4">
        <div className="text-sm font-medium">里程碑示例</div>
        <div className="mt-2 text-sm text-muted-foreground">
          预计 6 个月：翻身（未达成）
        </div>
      </section>
    </main>
  );
}

