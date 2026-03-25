"use client";

import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type LocalMilestoneGoal = {
  id: string;
  title: string;
  description?: string;
};

const LOCAL_GOALS_KEY = "bt_local_milestone_goals_v1";
const LOCAL_MILESTONES_KEY = "bt_local_milestone_records_v1";
const LOCAL_SCHEDULES_KEY = "bt_local_schedules_v1";
const LOCAL_NOTES_KEY = "bt_local_day_notes_v2";

type LocalMilestoneRecord = {
  id: string;
  date: string; // YYYY-MM-DD
  goalId: string | null;
  content: string;
};

type LocalSchedule = {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  synced_schedule_id?: string | null;
};

type LocalNoteCard = {
  id: string;
  content: string;
  tags: string[];
  synced_record_id?: string | null;
};

type LocalDayNotes = {
  date: string; // YYYY-MM-DD
  cards: LocalNoteCard[];
};

function readLocalGoals(): LocalMilestoneGoal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_GOALS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is LocalMilestoneGoal =>
          !!x &&
          typeof x === "object" &&
          typeof (x as any).id === "string" &&
          typeof (x as any).title === "string"
      )
      .map((g) => ({
        id: g.id,
        title: g.title,
        description:
          typeof g.description === "string" ? g.description : undefined,
        synced_milestone_id:
          typeof (g as any).synced_milestone_id === "string"
            ? (g as any).synced_milestone_id
            : null,
      }));
  } catch {
    return [];
  }
}

function writeLocalGoals(items: LocalMilestoneGoal[]) {
  localStorage.setItem(LOCAL_GOALS_KEY, JSON.stringify(items));
}

function readLocalMilestones(): LocalMilestoneRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_MILESTONES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => !!x && typeof x === "object")
      .map((m) => ({
        id:
          typeof (m as any).id === "string"
            ? (m as any).id
            : `ms_${crypto.randomUUID()}`,
        date: typeof (m as any).date === "string" ? (m as any).date : "",
        goalId: typeof (m as any).goalId === "string" ? (m as any).goalId : null,
        content: typeof (m as any).content === "string" ? (m as any).content : "",
        synced_record_id:
          typeof (m as any).synced_record_id === "string"
            ? (m as any).synced_record_id
            : null,
      }))
      .filter((m) => !!m.date);
  } catch {
    return [];
  }
}

export default function MePage() {
  const [goals, setGoals] = useState<LocalMilestoneGoal[]>([]);
  const [milestones, setMilestones] = useState<LocalMilestoneRecord[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // ---- Cloud fetch for milestones ----
  async function fetchMilestonesFromCloud() {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/milestones", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        ok?: boolean;
        goals?: { id: string; title: string; description?: string }[];
        records?: {
          id: string;
          milestone_id: string | null;
          record_date: string;
          content: string;
        }[];
        error?: string;
      };
      if (!json.ok) {
        setMilestoneError((json as any)?.error ?? "云端加载失败，请确认已在 Supabase 执行建表 SQL");
        return;
      }
      setMilestoneError(null);
      const cloudGoals: LocalMilestoneGoal[] = (json.goals ?? []).map((g) => ({
        id: g.id,
        title: g.title,
        description: g.description ?? undefined,
      }));
      const cloudRecords: LocalMilestoneRecord[] = (json.records ?? []).map((r) => ({
        id: r.id,
        date: r.record_date.slice(0, 10),
        goalId: r.milestone_id ?? null,
        content: r.content,
      }));
      setGoals(cloudGoals);
      setMilestones(cloudRecords);
      writeLocalGoals(cloudGoals);
      localStorage.setItem(LOCAL_MILESTONES_KEY, JSON.stringify(cloudRecords));
    } catch { /* silently fail */ }
  }

  useEffect(() => {
    // Seed from localStorage immediately (instant UI)
    setGoals(readLocalGoals());
    setMilestones(readLocalMilestones());
    // Then refresh from cloud
    fetchMilestonesFromCloud();
    // Re-fetch on auth change
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => { if (session) fetchMilestonesFromCloud(); }
    );
    // Re-fetch when app comes back to foreground
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchMilestonesFromCloud();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function syncSchedules() {
    setSyncMsg(null);
    setSyncing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setSyncMsg("未登录：请先到 /login 使用匿名登录（开发用）");
        setSyncing(false);
        return;
      }

      const raw = localStorage.getItem(LOCAL_SCHEDULES_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      const list = Array.isArray(parsed) ? (parsed as LocalSchedule[]) : [];

      const unsynced = list.filter((s) => !s.synced_schedule_id);
      if (unsynced.length === 0) {
        setSyncMsg("没有需要同步的日程（本地都已同步）");
        setSyncing(false);
        return;
      }

      const payload = {
        items: unsynced.map((s) => ({
          localId: s.id,
          title: s.title,
          start_time: s.start_time,
          end_time: s.end_time ?? null,
        })),
      };

      const res = await fetch("/api/sync/schedules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      const json = text ? (JSON.parse(text) as any) : null;
      if (!res.ok || !json?.ok) {
        setSyncMsg(json?.error ?? "同步失败");
        setSyncing(false);
        return;
      }

      const mappings: { localId: string; scheduleId: string | null }[] =
        json.mappings ?? [];
      const mappingMap = new Map(mappings.map((m) => [m.localId, m.scheduleId]));
      const updated = list.map((s) => {
        const sid = mappingMap.get(s.id);
        return sid ? { ...s, synced_schedule_id: sid } : s;
      });
      localStorage.setItem(LOCAL_SCHEDULES_KEY, JSON.stringify(updated));

      setSyncMsg(`已同步日程：${mappings.length} 条`);
      setSyncing(false);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "同步失败");
      setSyncing(false);
    }
  }

  async function syncNotes() {
    setSyncMsg(null);
    setSyncing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setSyncMsg("未登录：请先到 /login 使用匿名登录（开发用）");
        setSyncing(false);
        return;
      }

      const raw = localStorage.getItem(LOCAL_NOTES_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      const days = Array.isArray(parsed) ? (parsed as LocalDayNotes[]) : [];

      const unsyncedDays: LocalDayNotes[] = days
        .map((d) => ({
          ...d,
          cards: (d.cards ?? []).filter((c) => !c.synced_record_id),
        }))
        .filter((d) => d.cards.length > 0);

      if (unsyncedDays.length === 0) {
        setSyncMsg("没有需要同步的小记事卡片（本地都已同步）");
        setSyncing(false);
        return;
      }

      const payload = {
        days: unsyncedDays.map((d) => ({
          date: d.date,
          cards: d.cards.map((c) => ({
            localCardId: c.id,
            content: c.content,
            tags: c.tags ?? [],
          })),
        })),
      };

      const res = await fetch("/api/sync/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      const json = text ? (JSON.parse(text) as any) : null;
      if (!res.ok || !json?.ok) {
        setSyncMsg(json?.error ?? "同步失败");
        setSyncing(false);
        return;
      }

      const mappings: { localCardId: string; recordId: string }[] =
        json.mappings ?? [];
      const mappingMap = new Map(mappings.map((m) => [m.localCardId, m.recordId]));

      const updatedDays = days.map((d) => ({
        ...d,
        cards: (d.cards ?? []).map((c) => {
          const rid = mappingMap.get(c.id);
          return rid ? { ...c, synced_record_id: rid } : c;
        }),
      }));
      localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(updatedDays));

      setSyncMsg(`已同步小记事卡片：${mappings.length} 条`);
      setSyncing(false);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "同步失败");
      setSyncing(false);
    }
  }

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        const res = await fetch("/api/milestones/goals", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ title: trimmed, description: description.trim() || "" }),
        });
        const json = (await res.json()) as { ok?: boolean; goal?: LocalMilestoneGoal };
        if (json.ok && json.goal) {
          const updated = [...goals, json.goal];
          setGoals(updated);
          writeLocalGoals(updated);
        }
      } else {
        // Offline fallback
        const next: LocalMilestoneGoal = {
          id: crypto.randomUUID(),
          title: trimmed,
          description: description.trim() || undefined,
        };
        const updated = [...goals, next];
        setGoals(updated);
        writeLocalGoals(updated);
      }
    } catch {
      // Offline fallback
      const next: LocalMilestoneGoal = {
        id: crypto.randomUUID(),
        title: trimmed,
        description: description.trim() || undefined,
      };
      const updated = [...goals, next];
      setGoals(updated);
      writeLocalGoals(updated);
    }
    setTitle("");
    setDescription("");
    setShowAddGoal(false);
  };

  const handleDeleteGoal = async (id: string) => {
    // Optimistic local update
    const updated = goals.filter((g) => g.id !== id);
    setGoals(updated);
    writeLocalGoals(updated);
    // Also remove associated records
    setMilestones((prev) => {
      const filtered = prev.filter((m) => m.goalId !== id);
      localStorage.setItem(LOCAL_MILESTONES_KEY, JSON.stringify(filtered));
      return filtered;
    });
    // Sync to cloud
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        await fetch(`/api/milestones/goals/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch { /* ignore */ }
  };

  async function fetchInvite() {
    setInviteLoading(true);
    setInviteError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setInviteLoading(false);
        return;
      }
      const res = await fetch("/api/family/invite", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        ok?: boolean;
        invite_code?: string;
        invite_url?: string;
        error?: string;
      };
      if (json.ok && json.invite_url) {
        setInviteUrl(json.invite_url);
        setInviteCode(json.invite_code ?? null);
      } else {
        setInviteError(json?.error ?? "获取邀请链接失败");
      }
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setInviteLoading(false);
    }
  }

  function copyInvite() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    });
  }

  useEffect(() => {
    fetchInvite();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) fetchInvite();
    });
    return () => subscription.unsubscribe();
  }, []);

  const goalTitleById = useMemo(() => {
    const map = new Map<string, string>();
    goals.forEach((g) => map.set(g.id, g.title));
    return map;
  }, [goals]);

  const sortedMilestones = useMemo(() => {
    return [...milestones].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [milestones]);

  const milestonesByGoal = useMemo(() => {
    const map = new Map<string | null, LocalMilestoneRecord[]>();
    sortedMilestones.forEach((m) => {
      const key = m.goalId ?? null;
      const arr = map.get(key) ?? [];
      arr.push(m);
      map.set(key, arr);
    });
    return map;
  }, [sortedMilestones]);

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-card p-4">
        <div className="flex items-center gap-2">
          <Users className="size-5 text-primary" strokeWidth={1.5} />
          <span className="font-medium">邀请家人</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          分享邀请链接，让家人加入同一家庭，共同查看和管理宝宝的日程与成长记录。
        </p>
        {inviteLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">加载中…</p>
        ) : inviteUrl ? (
          <div className="mt-3 space-y-2">
            {inviteCode ? (
              <div className="rounded-xl bg-muted/50 px-3 py-2 font-mono text-sm">
                {inviteCode}
              </div>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={copyInvite}
              className="w-full rounded-xl"
            >
              {inviteCopied ? "已复制" : "复制邀请链接"}
            </Button>
          </div>
        ) : inviteError ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-destructive">{inviteError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchInvite}
              className="w-full rounded-xl"
            >
              重试
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            请先 <Link href="/login" className="underline">登录</Link> 后使用邀请功能。
          </p>
        )}
      </section>

      <header className="space-y-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          我的 / 里程碑
        </h1>
        <p className="text-sm text-muted-foreground">
          在这里为宝宝设定关键目标（例如“独立完成一餐”“独自站立 30 秒”等），
          日视图里的里程碑记录可以关联到这些目标。
        </p>
      </header>

      {milestoneError ? (
        <section className="rounded-2xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300">
          ⚠️ {milestoneError}
        </section>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">目标列表</div>
          <button
            type="button"
            onClick={() => setShowAddGoal((v) => !v)}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-2xl bg-secondary px-3 text-xs font-medium text-secondary-foreground"
          >
            <Plus className="size-4" />
            新增目标
          </button>
        </div>

        {showAddGoal ? (
          <div className="rounded-2xl border border-border/70 bg-background p-3">
            <form onSubmit={handleAddGoal} className="space-y-3">
              <div>
                <label className="text-sm font-medium">目标内容</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  placeholder="例如：独立完成一餐 / 独自站立 30 秒"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium">补充说明（可选）</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="mt-1 w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  placeholder="可以写衡量标准、期望时间等…"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddGoal(false)}
                  className="inline-flex h-9 items-center justify-center rounded-2xl border border-border/70 bg-background px-4 text-sm font-medium text-foreground"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="inline-flex h-9 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-medium text-primary-foreground"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            还没有目标。点击右上角「新增目标」开始添加。
          </p>
        ) : (
          <div className="space-y-3">
            {goals.map((g) => (
              <div
                key={g.id}
                className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background p-3"
              >
                <div className="flex-1 space-y-1">
                  <div className="font-medium">{g.title}</div>
                  {g.description ? (
                    <div className="text-sm text-muted-foreground">
                      {g.description}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteGoal(g.id)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
        <div className="text-sm font-medium">里程碑记录</div>
        <p className="text-sm text-muted-foreground">
          这里展示你在日历日视图中维护的里程碑记录，并附带记录日期与关联目标。
        </p>

        {sortedMilestones.length === 0 ? (
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
            还没有里程碑记录。去日历里某一天的日视图添加一条吧。
          </div>
        ) : null}

        <div className="space-y-4">
          {/* By goal (only show goals that have records) */}
          {goals
            .map((g) => ({ goal: g, items: milestonesByGoal.get(g.id) ?? [] }))
            .filter(({ items }) => items.length > 0)
            .map(({ goal: g, items }) => (
              <div
                key={g.id}
                className="rounded-2xl border border-border/70 bg-background p-3"
              >
                <div className="space-y-1">
                  <div className="font-medium">{g.title}</div>
                  {g.description ? (
                    <div className="text-sm text-muted-foreground">
                      {g.description}
                    </div>
                  ) : null}
                  <div className="text-xs text-muted-foreground">
                    已关联记录：{items.length}
                  </div>
                </div>

                <div className="mt-3 space-y-3">
                  {items.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-2xl border border-accent/40 bg-accent/15 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium text-muted-foreground">
                          {m.date}
                        </div>
                        <Link
                          href={`/calendar?date=${encodeURIComponent(m.date)}`}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          在日历中查看
                        </Link>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm">
                        {m.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Unlinked */}
            {(() => {
              const unlinked = milestonesByGoal.get(null) ?? [];
              if (unlinked.length === 0) return null;
              return (
                <div className="rounded-2xl border border-border/70 bg-background p-3">
                  <div className="space-y-1">
                    <div className="font-medium">未关联目标</div>
                    <div className="text-xs text-muted-foreground">
                      记录数：{unlinked.length}
                    </div>
                  </div>
                  <div className="mt-3 space-y-3">
                    {unlinked.map((m) => (
                      <div
                        key={m.id}
                        className="rounded-2xl border border-accent/40 bg-accent/15 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium text-muted-foreground">
                            {m.date}
                          </div>
                          <Link
                            href={`/calendar?date=${encodeURIComponent(m.date)}`}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            在日历中查看
                          </Link>
                        </div>
                        <div className="mt-2 whitespace-pre-wrap text-sm">
                          {m.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Deleted goals */}
            {(() => {
              const deletedGoalItems = sortedMilestones.filter(
                (m) => m.goalId && !goalTitleById.has(m.goalId)
              );
              if (deletedGoalItems.length === 0) return null;
              return (
                <div className="rounded-2xl border border-border/70 bg-background p-3">
                  <div className="space-y-1">
                    <div className="font-medium">目标已删除（历史记录）</div>
                    <div className="text-xs text-muted-foreground">
                      记录数：{deletedGoalItems.length}
                    </div>
                  </div>
                  <div className="mt-3 space-y-3">
                    {deletedGoalItems.map((m) => (
                      <div
                        key={m.id}
                        className="rounded-2xl border border-accent/40 bg-accent/15 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium text-muted-foreground">
                            {m.date}
                          </div>
                          <Link
                            href={`/calendar?date=${encodeURIComponent(m.date)}`}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            在日历中查看
                          </Link>
                        </div>
                        <div className="mt-2 whitespace-pre-wrap text-sm">
                          {m.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
        </div>
      </section>
    </main>
  );
}