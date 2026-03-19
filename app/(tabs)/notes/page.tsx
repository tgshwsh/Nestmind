"use client";

import { useEffect, useMemo, useState } from "react";

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
  } catch {
    // ignore
  }
}

export default function NotesPage() {
  const [notes, setNotes] = useState<LocalDayNotes[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");

  useEffect(() => {
    setNotes(readLocalNotes());
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCAL_NOTES_KEY) setNotes(readLocalNotes());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
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

  function startEdit(card: LocalNoteCard) {
    setEditingCardId(card.id);
    setEditingContent(card.content);
  }

  function updateCardContent(dayDate: string, cardId: string, content: string) {
    setNotes((prev) => {
      const next = prev.map((d) =>
        d.date === dayDate
          ? {
              ...d,
              cards: (d.cards ?? []).map((c) =>
                c.id === cardId ? { ...c, content } : c
              ),
            }
          : d
      );
      writeLocalNotes(next);
      return next;
    });
  }

  function deleteCard(dayDate: string, cardId: string) {
    setNotes((prev) => {
      const next = prev
        .map((d) =>
          d.date === dayDate
            ? { ...d, cards: (d.cards ?? []).filter((c) => c.id !== cardId) }
            : d
        )
        .filter((d) => (d.cards ?? []).length > 0);
      writeLocalNotes(next);
      return next;
    });
    if (editingCardId === cardId) {
      setEditingCardId(null);
      setEditingContent("");
    }
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

      {filtered.length === 0 ? (
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
              <div className="font-display text-base font-semibold">
                {day.date}
              </div>
              <div className="mt-3 space-y-3">
                {(day.cards ?? []).map((c) => {
                  const isEditing = editingCardId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => startEdit(c)}
                      className="w-full text-left"
                    >
                      <div className="rounded-2xl border border-border/70 bg-background p-3">
                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              value={editingContent}
                              onChange={(e) => {
                                setEditingContent(e.target.value);
                                updateCardContent(day.date, c.id, e.target.value);
                              }}
                              rows={3}
                              className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                            />
                            <div className="flex justify-between items-center">
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

