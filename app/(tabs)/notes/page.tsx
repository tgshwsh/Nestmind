export default function NotesPage() {
  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">记事 / 日记</h1>
        <p className="text-sm text-muted-foreground">这里后面会接记录与媒体。</p>
      </header>

      <section className="rounded-2xl border border-border/70 bg-card p-4">
        <div className="text-sm font-medium">一条示例记录</div>
        <div className="mt-2 text-sm text-muted-foreground">
          今天宝宝笑了三次，情绪很稳定。
        </div>
      </section>
    </main>
  );
}

