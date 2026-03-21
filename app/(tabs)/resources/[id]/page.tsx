"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ArrowLeft, Calendar, FileText } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  book: "书籍",
  audio: "音频",
  tool: "教具",
  activity: "活动",
};

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

type ResourceDetail = {
  id: string;
  title: string;
  resource_type: "book" | "audio" | "tool" | "activity";
  target_audience: "baby" | "parent";
  category: { name: string } | null;
  level: { name: string } | null;
  source_url: string | null;
  created_at: string;
  tags: { id: string; name: string }[];
};

type BacklinkRecord = {
  id: string;
  content: string;
  created_at: string;
};

type BacklinkSchedule = {
  id: string;
  title: string;
  start_time: string;
};

function formatDateOnly(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ResourceDetailPage() {
  const params = useParams();
  const id = params?.id as string | undefined;

  const [resource, setResource] = useState<ResourceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [records, setRecords] = useState<BacklinkRecord[]>([]);
  const [schedules, setSchedules] = useState<BacklinkSchedule[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [planStart, setPlanStart] = useState("");
  const [planEnd, setPlanEnd] = useState("");
  const [planWeekdays, setPlanWeekdays] = useState<number[]>([]);
  const [planTimeStart, setPlanTimeStart] = useState("09:00");
  const [planTimeEnd, setPlanTimeEnd] = useState("09:30");
  const [planSubmitting, setPlanSubmitting] = useState(false);
  const [planMessage, setPlanMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const { data, error: e } = await supabase
        .from("resources")
        .select(
          `
          id,
          title,
          resource_type,
          target_audience,
          source_url,
          created_at,
          category:resource_categories(name),
          level:resource_levels(name),
          resource_tag_relations(tags(id,name))
        `
        )
        .eq("id", id)
        .single();

      if (cancelled) return;
      if (e) {
        setError(e.message);
        setResource(null);
        setLoading(false);
        return;
      }

      const rel = Array.isArray((data as any)?.resource_tag_relations)
        ? (data as any).resource_tag_relations
        : [];
      const tags = rel
        .map((x: any) => x?.tags)
        .filter(Boolean)
        .map((t: any) => ({ id: t.id, name: t.name }));

      setResource({
        id: (data as any).id,
        title: (data as any).title,
        resource_type: (data as any).resource_type,
        target_audience: (data as any).target_audience ?? "baby",
        category: (data as any).category ?? null,
        level: (data as any).level ?? null,
        source_url: (data as any).source_url ?? null,
        created_at: (data as any).created_at,
        tags,
      });
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleDeleteSchedule(scheduleId: string) {
    try {
      setDeletingId(scheduleId);
      const { error } = await supabase.from("schedules").delete().eq("id", scheduleId);
      if (error) {
        setPlanMessage(error.message);
      } else {
        setPlanMessage("已删除一条日程");
        setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
      }
    } finally {
      setDeletingId((prev) => (prev === scheduleId ? null : prev));
    }
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function loadBacklinks() {
      const [recRes, schedRes] = await Promise.all([
        supabase
          .from("record_resource_relations")
          .select("record_id")
          .eq("resource_id", id),
        supabase
          .from("schedules")
          .select("id, title, start_time")
          .eq("resource_id", id)
          .order("start_time", { ascending: true }),
      ]);

      if (cancelled) return;

      const recordIds = (recRes.data ?? []).map((r: any) => r.record_id).filter(Boolean);
      if (recordIds.length > 0) {
        const { data: recData } = await supabase
          .from("records")
          .select("id, content, created_at")
          .in("id", recordIds)
          .order("created_at", { ascending: false });
        setRecords((recData as BacklinkRecord[]) ?? []);
      } else {
        setRecords([]);
      }

      setSchedules((schedRes.data as BacklinkSchedule[]) ?? []);
    }

    loadBacklinks();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function submitPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setPlanSubmitting(true);
    setPlanMessage(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setPlanMessage("未登录，请先登录");
        setPlanSubmitting(false);
        return;
      }
      const res = await fetch("/api/resources/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resource_id: id,
          start_date: planStart || new Date().toISOString().slice(0, 10),
          end_date:
            planEnd ||
            new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          weekdays: planWeekdays.length ? planWeekdays : [1, 3, 5],
          start_time_slot: planTimeStart,
          end_time_slot: planTimeEnd,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPlanMessage(json.error ?? "生成失败");
        setPlanSubmitting(false);
        return;
      }
      setPlanMessage(`已生成 ${json.count ?? 0} 条日程`);
      setPlanStart("");
      setPlanEnd("");
      setPlanWeekdays([]);
      setPlanTimeStart("09:00");
      setPlanTimeEnd("09:30");
      setPlanSubmitting(false);
    } catch (err) {
      setPlanMessage(err instanceof Error ? err.message : "请求失败");
      setPlanSubmitting(false);
    }
  }

  function toggleWeekday(d: number) {
    setPlanWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  }

  if (!id) {
    return (
      <main className="min-h-screen bg-detail-bg">
        <p className="p-4 text-detail-muted-foreground">无效的资源 ID</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-detail-bg">
        <div className="p-4 text-detail-muted-foreground">加载中…</div>
      </main>
    );
  }

  if (error || !resource) {
    return (
      <main className="min-h-screen bg-detail-bg">
        <div className="p-4 text-destructive">{error ?? "未找到该资源"}</div>
        <Link
          href="/resources"
          className="ml-4 inline-flex items-center gap-1 text-detail-primary"
        >
          <ArrowLeft className="size-4" /> 返回资料库
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-detail-bg text-foreground">
      <header className="sticky top-0 z-10 border-b border-detail-border bg-detail-card/95 backdrop-blur supports-[backdrop-filter]:bg-detail-card/80">
        <div className="flex items-center gap-2 px-4 py-3">
          <Link
            href="/resources"
            className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-medium text-detail-foreground active:scale-95 touch-manipulation"
          >
            <ArrowLeft className="size-4" strokeWidth={2} />
            资料库
          </Link>
        </div>
      </header>

      <div className="space-y-6 p-4 pb-8">
        {/* 顶部：资源信息 */}
        <section className="rounded-3xl border border-detail-border bg-detail-card/95 p-4 shadow-sm shadow-detail-muted/40">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
            {resource.title}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-detail-primary/20 px-2.5 py-0.5 text-xs font-medium text-detail-primary">
              {TYPE_LABEL[resource.resource_type] ?? resource.resource_type}
            </span>
            {resource.category?.name ? (
              <span className="rounded-full bg-detail-muted px-2.5 py-0.5 text-xs text-detail-muted-foreground">
                {resource.category.name}
              </span>
            ) : null}
            {resource.level?.name ? (
              <span className="rounded-full bg-detail-muted px-2.5 py-0.5 text-xs text-detail-muted-foreground">
                {resource.level.name}
              </span>
            ) : null}
          </div>
          {resource.tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {resource.tags.map((t) => (
                <span
                  key={t.id}
                  className="rounded-full bg-detail-primary/10 px-2 py-0.5 text-[11px] text-detail-primary"
                >
                  #{t.name}
                </span>
              ))}
            </div>
          ) : null}
          {resource.source_url ? (
            <a
              href={resource.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block truncate text-xs text-detail-primary underline"
            >
              {resource.source_url}
            </a>
          ) : null}
        </section>

        {/* 中间：生成计划 */}
        <section className="rounded-3xl border border-detail-border bg-detail-card/95 p-4 shadow-sm shadow-detail-muted/40">
          <h2 className="text-sm font-medium text-foreground">生成计划</h2>
          <p className="mt-1 text-xs text-detail-muted-foreground">
            按起止日期和每周频次，自动在日历中创建日程
          </p>
          <form onSubmit={submitPlan} className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-detail-muted-foreground">
                  开始日期
                </label>
                <input
                  type="date"
                  value={planStart}
                  onChange={(e) => setPlanStart(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-detail-border bg-detail-bg px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-detail-primary/40"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-detail-muted-foreground">
                  结束日期
                </label>
                <input
                  type="date"
                  value={planEnd}
                  onChange={(e) => setPlanEnd(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-detail-border bg-detail-bg px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-detail-primary/40"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-detail-muted-foreground">
                每周执行日
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {WEEKDAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleWeekday(i)}
                    className={cn(
                      "rounded-xl px-3 py-1.5 text-xs font-medium transition-colors",
                      planWeekdays.includes(i)
                        ? "bg-secondary text-secondary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-detail-muted-foreground">
                  开始时间
                </label>
                <input
                  type="time"
                  value={planTimeStart}
                  onChange={(e) => setPlanTimeStart(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-detail-border bg-detail-bg px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-detail-primary/40"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-detail-muted-foreground">
                  结束时间
                </label>
                <input
                  type="time"
                  value={planTimeEnd}
                  onChange={(e) => setPlanTimeEnd(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-detail-border bg-detail-bg px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-detail-primary/40"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={planSubmitting}
              className="w-full rounded-3xl bg-accent py-2.5 text-sm font-semibold text-accent-foreground shadow-sm transition-transform duration-150 hover:brightness-95 hover:scale-[1.02] disabled:opacity-50"
            >
              {planSubmitting ? "生成中…" : "生成计划"}
            </button>
            {planMessage ? (
              <p className="text-center text-sm text-detail-muted-foreground">{planMessage}</p>
            ) : null}
          </form>
        </section>

        {/* 底部：反向链接 */}
        <section className="rounded-3xl border border-detail-border bg-detail-card/95 p-4 shadow-sm shadow-detail-muted/40">
          <h2 className="text-sm font-medium text-foreground">反向链接</h2>
          <p className="mt-1 text-xs text-detail-muted-foreground">
            引用过该资源的日记与日程
          </p>

          {schedules.length > 0 ? (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-detail-muted-foreground">
                <Calendar className="size-3.5" />
                日程
              </div>
              <ul className="space-y-2">
                {schedules.map((s) => {
                  const dateStr = formatDateOnly(s.start_time);
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/calendar?date=${dateStr}`}
                        className="flex items-center gap-2 rounded-xl border border-detail-border bg-detail-bg p-3 text-sm text-foreground hover:bg-detail-muted/50"
                      >
                        <div className="flex-1">
                          <span className="font-medium">{s.title}</span>
                          <span className="ml-2 text-detail-muted-foreground">{dateStr}</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            handleDeleteSchedule(s.id);
                          }}
                          className="rounded-full bg-detail-muted px-2 py-0.5 text-[11px] text-detail-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                          disabled={deletingId === s.id}
                        >
                          {deletingId === s.id ? "删除中…" : "删除"}
                        </button>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {records.length > 0 ? (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-detail-muted-foreground">
                <FileText className="size-3.5" />
                日记
              </div>
              <ul className="space-y-2">
                {records.map((r) => {
                  const dateStr = formatDateOnly(r.created_at);
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/calendar?date=${dateStr}`}
                        className="block rounded-xl border border-detail-border bg-detail-bg p-3 text-sm text-foreground hover:bg-detail-muted/50"
                      >
                        <p className="line-clamp-2 text-detail-muted-foreground">{r.content}</p>
                        <span className="mt-1 block text-xs text-detail-muted-foreground">
                          {dateStr}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {schedules.length === 0 && records.length === 0 ? (
            <p className="mt-4 text-sm text-detail-muted-foreground">暂无引用</p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
