"use client";

import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase/client";

type LocalNoteCard = {
  id: string;
  content: string;
  tags: string[];
};

type LocalDayNotes = {
  date: string; // YYYY-MM-DD
  cards: LocalNoteCard[];
};

const LOCAL_NOTES_KEY = "bt_local_day_notes_v2";

function readLocalNotes(): LocalDayNotes[] {
  try {
    const raw = localStorage.getItem(LOCAL_NOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean) as LocalDayNotes[];
  } catch {
    return [];
  }
}

function writeLocalNotes(items: LocalDayNotes[]) {
  try {
    localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(items));
  } catch { /* ignore */ }
}

export default function NotesPage() {
  const [notes, setNotes] = useState<LocalDayNotes[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function fetchNotes() {
    // Start with local cache
    const local = readLocalNotes();
    if (local.length > 0) setNotes(local);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { setLoading(false); return; }

      const now = new Date();
      const from = new Date(now.getFullYear() - 1, now.getMonth(), 1)
        .toISOString()
        .slice(0, 10);
      const to = new Date(now.getFullYear() + 1, 11, 31)
        .toISOString()
        .slice(0, 10);

      const res = await fetch(`/api/notes?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        setSyncError(`云端加载失败(${res.status})：${err || "请确认已在 Supabase 执行建表 SQL"}`);
        setLoading(false);
        return;
      }

      const json = (await res.json()) as {
        ok?: boolean;
        items?: { id: string; note_date: string; content: string; tags: string[] }[];
        error?: string;
      };
      if (!json.ok || !Array.isArray(json.items)) {
        setSyncError(json?.error ?? "云端加载失败，请确认已在 Supabase 执行建表 SQL");
        setLoading(false);
        return;
      }
      setSyncError(null);

      // Group by date
      const map = new Map<string, LocalNoteCard[]>();
      for (const item of json.items) {
        const date = item.note_date.slice(0, 10);
        if (!map.has(date)) map.set(date, []);
        map.get(date)!.push({
          id: item.id,
          content: item.content,
          tags: item.tags ?? [],
        });
      }
      const cloudNotes: LocalDayNotes[] = Array.from(map.entries()).map(
        ([date, cards]) => ({ date, cards })
      );
      setNotes(cloudNotes);
      writeLocalNotes(cloudNotes);
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => {
    fetchNotes();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => { if (session) fetchNotes(); }
    );
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchNotes();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((d) => d.cards?.forEach((c) => c.tags?.forEach((t) => set.add(t))));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [notes]);

  const filtered = useMemo(() => {
    const sorted = [...notes].sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!activeTag) return sorted;
    return sorted
      .map((d) => ({
        ...d,
        cards: (d.cards ?? []).filter((c) => (c.tags ?? []).includes(activeTag)),
      }))
      .filter((d) => d.cards.length > 0);
  }, [notes, activeTag]);

  async function saveCardEdit(dayDate: string, cardId: string, content: string) {
    const updated = notes.map((d) =>
      d.date !== dayDate
        ? d
        : { ...d, cards: d.cards.map((c) => (c.id === cardId ? { ...c, content } : c)) }
    );
    setNotes(updated);
    writeLocalNotes(updated);
    // Sync to cloud
    const day = updated.find((d) => d.date === dayDate);
    if (!day) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    fetch("/api/notes/day", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ date: dayDate, cards: day.cards }),
    }).catch(() => {});
  }

  async function deleteCard(dayDate: string, cardId: string) {
    const updated = notes
      .map((d) =>
        d.date !== dayDate
          ? d
          : { ...d, cards: d.cards.filter((c) => c.id !== cardId) }
      )
      .filter((d) => d.cards.length > 0);
    setNotes(updated);
    writeLocalNotes(updated);
    if (editingCardId === cardId) { setEditingCardId(null); setEditingContent(""); }
    // Sync to cloud
    const day = updated.find((d) => d.date === dayDate) ?? { date: dayDate, cards: [] };
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    fetch("/api/notes/day", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ date: dayDate, cards: day.cards }),
    }).catch(() => {});
  }

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          记事 / 日记
        </h1>
        <p className="text-sm text-muted-foreground">
          这里会自动展示你在日历日视图里创建的「小记事卡片」。
        </p>
      </header>

      {syncError ? (
        <section className="rounded-2xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300">
          ⚠️ {syncError}
        </section>
      ) : null}

      <section className="rounded-2xl border border-border/70 bg-card p-4">
        <div className="text-sm font-medium">按标签筛选</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            className={
              activeTag === null
                ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                : "rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground hover:bg-muted/80"
            }
          >
            全部
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTag(t)}
              className={
                activeTag === t
                  ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                  : "rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground hover:bg-muted/80"
              }
            >
              #{t}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <section className="rounded-2xl border border-border/70 bg-card p-4 text-sm text-muted-foreground">
          加载中…
        </section>
      ) : filtered.length === 0 ? (
        <section className="rounded-2xl border border-border/70 bg-card p-4 text-sm text-muted-foreground">
          还没有记录。去日历里某一天的日视图点「增加小卡片」开始记录吧。
        </section>
      ) : (
        <div className="space-y-4">
          {filtered.map((day) => (
            <section
              key={day.date}
              className="rounded-2xl border border-border/70 bg-card p-4"
            >
              <div className="font-display text-base font-semibold">{day.date}</div>
              <div className="mt-3 space-y-3">
                {(day.cards ?? []).map((c) => {
                  const isEditing = editingCardId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setEditingCardId(c.id); setEditingContent(c.content); }}
                      className="w-full text-left"
                    >
                      <div className="rounded-2xl border border-border/70 bg-background p-3">
                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              value={editingContent}
                              onChange={(e) => setEditingContent(e.target.value)}
                              onBlur={() => saveCardEdit(day.date, c.id, editingContent)}
                              rows={3}
                              className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                            />
                            <div className="flex items-center justify-between">
                              {c.tags?.length ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {c.tags.map((t) => (
                                    <span
                                      key={t}
                                      className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                                    >
                                      #{t}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  点击其他卡片可切换编辑
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteCard(day.date, c.id);
                                }}
                                className="rounded-full bg-destructive/10 px-3 py-1 text-xs text-destructive hover:bg-destructive/20"
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="whitespace-pre-wrap text-sm">{c.content}</div>
                            {c.tags?.length ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {c.tags.map((t) => (
                                  <span
                                    key={t}
                                    className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                                  >
                                    #{t}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
