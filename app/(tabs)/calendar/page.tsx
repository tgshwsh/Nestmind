"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

type Schedule = {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  is_recurring: boolean;
  resource_id?: string | null;
  category_name?: string | null;
  first_tag_name?: string | null;
};

type LocalSchedule = {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
};

const LOCAL_SCHEDULES_KEY = "bt_local_schedules_v1";
const SCHEDULES_BACKUP_KEY = "bt_schedules_backup_v1";
const LOCAL_NOTES_KEY = "bt_local_day_notes_v2";
const LOCAL_GOALS_KEY = "bt_local_milestone_goals_v1";
const LOCAL_MILESTONES_KEY = "bt_local_milestone_records_v1";

type LocalNoteCard = {
  id: string;
  content: string;
  tags: string[];
};

type LocalDayNotes = {
  date: string; // YYYY-MM-DD
  cards: LocalNoteCard[];
};

type LocalMilestoneGoal = {
  id: string;
  title: string;
  description?: string;
};

type LocalMilestoneRecord = {
  id: string;
  date: string; // YYYY-MM-DD
  goalId: string | null;
  content: string;
};

function readLocalSchedules(): LocalSchedule[] {
  try {
    const raw = localStorage.getItem(LOCAL_SCHEDULES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is LocalSchedule =>
          !!x &&
          typeof x === "object" &&
          typeof (x as any).id === "string" &&
          typeof (x as any).title === "string" &&
          typeof (x as any).start_time === "string"
      )
      .map((x) => ({
        id: x.id,
        title: x.title,
        start_time: x.start_time,
        end_time: typeof (x as any).end_time === "string" ? (x as any).end_time : null,
      }));
  } catch {
    return [];
  }
}

function writeLocalSchedules(items: LocalSchedule[]) {
  localStorage.setItem(LOCAL_SCHEDULES_KEY, JSON.stringify(items));
}

function readLocalNotes(): LocalDayNotes[] {
  try {
    const raw = localStorage.getItem(LOCAL_NOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is LocalDayNotes =>
          !!x &&
          typeof x === "object" &&
          typeof (x as any).date === "string" &&
          Array.isArray((x as any).cards)
      )
      .map((x) => ({
        date: (x as any).date,
        cards: ((x as any).cards as unknown[])
          .filter((c) => !!c && typeof c === "object")
          .map((c) => ({
            id:
              typeof (c as any).id === "string"
                ? (c as any).id
                : `card_${crypto.randomUUID()}`,
            content: typeof (c as any).content === "string" ? (c as any).content : "",
            tags: Array.isArray((c as any).tags)
              ? ((c as any).tags as unknown[]).filter(
                  (t): t is string => typeof t === "string"
                )
              : [],
          })),
      }));
  } catch {
    return [];
  }
}

function writeLocalNotes(items: LocalDayNotes[]) {
  localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(items));
}

function readLocalGoals(): LocalMilestoneGoal[] {
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
        id: (g as any).id,
        title: (g as any).title,
        description:
          typeof (g as any).description === "string"
            ? (g as any).description
            : undefined,
      }));
  } catch {
    return [];
  }
}

function readLocalMilestones(): LocalMilestoneRecord[] {
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
      }))
      .filter((m) => !!m.date);
  } catch {
    return [];
  }
}

function writeLocalMilestones(items: LocalMilestoneRecord[]) {
  localStorage.setItem(LOCAL_MILESTONES_KEY, JSON.stringify(items));
}

function getMonthStart(year: number, month: number) {
  return new Date(year, month, 1);
}

function getMonthEnd(year: number, month: number) {
  return new Date(year, month + 1, 0, 23, 59, 59, 999);
}

function getMonthGridDates(year: number, month: number) {
  // Always render 6 rows * 7 cols like Google Calendar
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay(); // 0..6 (Sun..Sat)
  const gridStart = new Date(year, month, 1 - startWeekday);
  const dates: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + i
    );
    dates.push(d);
  }
  return dates;
}

function stripTz(iso: string) {
  // Treat all stored datetimes as wall-clock local time regardless of any UTC marker
  return iso.replace(/(Z|[+-]\d{2}:?\d{2})(\.\d+)?$/, "");
}

function formatTime(iso: string) {
  const d = new Date(stripTz(iso));
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatLocalDateYYYYMMDD(y: number, m: number, d: number) {
  const mm = String(m + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function sameLocalDay(iso: string, y: number, m: number, d: number) {
  const date = new Date(stripTz(iso));
  return (
    date.getFullYear() === y &&
    date.getMonth() === m &&
    date.getDate() === d
  );
}

function keyLocalDay(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

type Mode = "month" | "day";

export default function CalendarPage() {
  const [today] = useState(() => new Date());
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDateObj, setSelectedDateObj] = useState<Date | null>(null);
  const [mode, setMode] = useState<Mode>("month");
  const [selectedDate, setSelectedDate] = useState<{
    y: number;
    m: number;
    d: number;
  } | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [localSchedules, setLocalSchedules] = useState<LocalSchedule[]>([]);
  const [isAuthed, setIsAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addDate, setAddDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [addStart, setAddStart] = useState("09:00");
  const [addEnd, setAddEnd] = useState("10:00");
  const [addSubmitting, setAddSubmitting] = useState(false);

  // Day view add form
  const [dayTitle, setDayTitle] = useState("");
  const [dayStart, setDayStart] = useState("09:00");
  const [dayEnd, setDayEnd] = useState("10:00");
  const [daySubmitting, setDaySubmitting] = useState(false);

  // Per-day note + tags
  const [notes, setNotes] = useState<LocalDayNotes[]>([]);
  const [noteCards, setNoteCards] = useState<LocalNoteCard[]>([]);
  const [milestoneGoals, setMilestoneGoals] = useState<LocalMilestoneGoal[]>([]);
  const [milestones, setMilestones] = useState<LocalMilestoneRecord[]>([]);

  const fetchSchedules = useCallback(async (y: number, m: number) => {
    setLoading(true);
    const start = getMonthStart(y, m);
    const end = getMonthEnd(y, m);
    const { data } = await supabase
      .from("schedules")
      .select(
        `
        id,
        title,
        start_time,
        end_time,
        is_recurring,
        resource_id,
        resources(
          resource_categories(name),
          resource_tag_relations(
            tags(name)
          )
        )
      `
      )
      .gte("start_time", start.toISOString())
      .lte("start_time", end.toISOString())
      .order("start_time", { ascending: true });
    const rows = (data ?? []) as any[];
    const normalized: Schedule[] = rows.map((r) => {
      const rel = Array.isArray(r.resources?.resource_tag_relations)
        ? r.resources.resource_tag_relations
        : [];
      const firstTag = rel
        .map((x: any) => x?.tags)
        .filter(Boolean)
        .map((t: any) => t.name)[0];
      return {
        id: r.id,
        title: r.title,
        start_time: r.start_time,
        end_time: r.end_time ?? null,
        is_recurring: r.is_recurring ?? false,
        resource_id: r.resource_id ?? null,
        category_name: r.resources?.resource_categories?.name ?? null,
        first_tag_name: firstTag ?? null,
      };
    });
    setSchedules(normalized);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(SCHEDULES_BACKUP_KEY, JSON.stringify(normalized));
      } catch {
        // ignore quota or other errors
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSchedules(year, month);
  }, [year, month, fetchSchedules]);

  // Re-fetch when the user switches back to the app (e.g. from another device)
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        fetchSchedules(year, month);
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [year, month, fetchSchedules]);

  useEffect(() => {
    // Support /calendar?date=YYYY-MM-DD deep link from milestones page
    if (typeof window === "undefined") return;
    const dateParam = new URLSearchParams(window.location.search).get("date");
    if (!dateParam) return;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateParam);
    if (!m) return;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const date = new Date(y, mo, d);
    setYear(y);
    setMonth(mo);
    setSelectedDateObj(date);
    setSelectedDate({ y, m: mo, d });
    setMode("day");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch notes from Supabase (cloud) + localStorage fallback
  const fetchCloudNotes = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;
      // Fetch a wide rolling window (±3 months from today)
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 3, 1)
        .toISOString()
        .slice(0, 10);
      const to = new Date(now.getFullYear(), now.getMonth() + 4, 0)
        .toISOString()
        .slice(0, 10);
      const res = await fetch(`/api/notes?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        ok?: boolean;
        items?: { id: string; note_date: string; content: string; tags: string[] }[];
      };
      if (!json.ok || !Array.isArray(json.items)) return;
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
    } catch {
      // silently fall back to localStorage
    }
  };

  useEffect(() => {
    // local schedules + notes + auth status
    if (typeof window !== "undefined") {
      const ls = readLocalSchedules();
      setLocalSchedules(ls);
      const ln = readLocalNotes();
      setNotes(ln);
      setMilestoneGoals(readLocalGoals());
      setMilestones(readLocalMilestones());
    }
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthed(!!data.session);
      if (data.session) fetchCloudNotes();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh notes from cloud when app becomes visible
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchCloudNotes();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedDateObj) return;
    // Prefill day form date/time + note cards when entering day view
    setDayTitle("");
    setDayStart("09:00");
    setDayEnd("10:00");
    if (!selectedDate) return;
    const key = formatLocalDateYYYYMMDD(
      selectedDate.y,
      selectedDate.m,
      selectedDate.d
    );
    const existing = notes.find((n) => n.date === key);
    setNoteCards(existing?.cards ?? []);
  }, [selectedDateObj, selectedDate, notes]);

  const gridDates = getMonthGridDates(year, month);

  const daysWithSchedules = useMemo(() => {
    const set = new Set<number>();
    schedules.forEach((s) => {
      const d = new Date(s.start_time);
      if (d.getFullYear() === year && d.getMonth() === month) {
        set.add(d.getDate());
      }
    });
    localSchedules.forEach((s) => {
      const d = new Date(s.start_time);
      if (d.getFullYear() === year && d.getMonth() === month) {
        set.add(d.getDate());
      }
    });
    return set;
  }, [schedules, localSchedules, year, month]);

  const scheduleDisplayTitle = (s: {
    title: string;
    category_name?: string | null;
    first_tag_name?: string | null;
  }) => s.category_name ?? s.first_tag_name ?? s.title;

  const selectedDaySchedules = useMemo(() => {
    if (!selectedDate) return [];
    const supa = schedules
      .filter((s) =>
        sameLocalDay(s.start_time, selectedDate.y, selectedDate.m, selectedDate.d)
      )
      .map((s) => ({ ...s, source: "supabase" as const }));
    const local = localSchedules
      .filter((s) =>
        sameLocalDay(s.start_time, selectedDate.y, selectedDate.m, selectedDate.d)
      )
      .map((s) => ({
        id: s.id,
        title: s.title,
        start_time: s.start_time,
        end_time: s.end_time,
        is_recurring: false,
        source: "local" as const,
        category_name: null as string | null,
      }));
    return [...supa, ...local].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
  }, [selectedDate, schedules, localSchedules]);

  const dayMilestones = useMemo(() => {
    if (!selectedDate) return [];
    const key = formatLocalDateYYYYMMDD(
      selectedDate.y,
      selectedDate.m,
      selectedDate.d
    );
    return milestones.filter((m) => m.date === key);
  }, [selectedDate, milestones]);

  const dayPreviewMap = useMemo(() => {
    // Map YYYY-MM-DD -> preview items sorted by time
    const map = new Map<string, { title: string; start_time: string }[]>();

    const push = (y: number, m: number, d: number, item: { title: string; start_time: string }) => {
      const k = keyLocalDay(y, m, d);
      const arr = map.get(k) ?? [];
      arr.push(item);
      map.set(k, arr);
    };

    schedules.forEach((s) => {
      const dt = new Date(s.start_time);
      push(dt.getFullYear(), dt.getMonth(), dt.getDate(), {
        title: scheduleDisplayTitle(s),
        start_time: s.start_time,
      });
    });
    localSchedules.forEach((s) => {
      const dt = new Date(s.start_time);
      push(dt.getFullYear(), dt.getMonth(), dt.getDate(), {
        title: s.title,
        start_time: s.start_time,
      });
    });

    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
      map.set(k, arr);
    }

    return map;
  }, [schedules, localSchedules]);

  const persistMilestones = (nextItems: LocalMilestoneRecord[]) => {
    // clean empty records
    const cleaned = nextItems
      .map((m) => ({ ...m, content: m.content ?? "" }))
      .filter((m) => m.date && (m.content.trim().length > 0 || m.goalId));
    setMilestones(cleaned);
    writeLocalMilestones(cleaned);
  };

  const handleAddMilestone = () => {
    if (!selectedDate) return;
    const dateStr = formatLocalDateYYYYMMDD(
      selectedDate.y,
      selectedDate.m,
      selectedDate.d
    );
    const next: LocalMilestoneRecord = {
      id: `ms_${crypto.randomUUID()}`,
      date: dateStr,
      goalId: milestoneGoals[0]?.id ?? null,
      content: "",
    };
    const updated = [...milestones, next];
    setMilestones(updated);
    writeLocalMilestones(updated);
  };

  const handleUpdateMilestoneContent = (id: string, content: string) => {
    const updated = milestones.map((m) => (m.id === id ? { ...m, content } : m));
    setMilestones(updated);
  };

  const handleUpdateMilestoneGoal = (id: string, goalId: string) => {
    const updated = milestones.map((m) =>
      m.id === id ? { ...m, goalId: goalId ? goalId : null } : m
    );
    setMilestones(updated);
    writeLocalMilestones(updated);
  };

  const handleDeleteMilestone = (id: string) => {
    const updated = milestones.filter((m) => m.id !== id);
    setMilestones(updated);
    writeLocalMilestones(updated);
  };

  const handlePrevMonth = () => {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else setMonth((m) => m - 1);
    setMode("month");
    setSelectedDateObj(null);
    setSelectedDate(null);
  };

  const handleNextMonth = () => {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else setMonth((m) => m + 1);
    setMode("month");
    setSelectedDateObj(null);
    setSelectedDate(null);
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addTitle.trim() || !addDate) return;
    setAddSubmitting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAddSubmitting(false);
      return;
    }
    const { data: userRow } = await supabase
      .from("users")
      .select("family_id")
      .eq("id", user.id)
      .single();
    if (!userRow?.family_id) {
      setAddSubmitting(false);
      return;
    }
    const startIso = `${addDate}T${addStart}:00`;
    const endIso = `${addDate}T${addEnd}:00`;
    await supabase.from("schedules").insert({
      family_id: userRow.family_id,
      title: addTitle.trim(),
      start_time: startIso,
      end_time: endIso,
      is_recurring: false,
    });
    await fetchSchedules(year, month);
    setAddTitle("");
    setAddDate("");
    setAddStart("09:00");
    setAddEnd("10:00");
    setShowAddForm(false);
    setAddSubmitting(false);
  };

  const handleDayAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDateObj || !selectedDate) return;
    if (!dayTitle.trim()) return;
    setDaySubmitting(true);

    const dateStr = formatLocalDateYYYYMMDD(
      selectedDate.y,
      selectedDate.m,
      selectedDate.d
    );
    const startIso = `${dateStr}T${dayStart}:00`;
    const endIso = dayEnd ? `${dateStr}T${dayEnd}:00` : null;

    // Try Supabase when authed, otherwise fallback to local
    if (isAuthed) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: userRow } = await supabase
          .from("users")
          .select("family_id")
          .eq("id", user.id)
          .single();
        if (userRow?.family_id) {
          await supabase.from("schedules").insert({
            family_id: userRow.family_id,
            title: dayTitle.trim(),
            start_time: startIso,
            end_time: endIso,
            is_recurring: false,
          });
          await fetchSchedules(year, month);
          setDayTitle("");
          setDaySubmitting(false);
          return;
        }
      }
    }

    const nextLocal: LocalSchedule = {
      id: `local_${crypto.randomUUID()}`,
      title: dayTitle.trim(),
      start_time: startIso,
      end_time: endIso,
    };
    const updated = [...localSchedules, nextLocal];
    setLocalSchedules(updated);
    writeLocalSchedules(updated);
    setDayTitle("");
    setDaySubmitting(false);
  };

  const handleDayDelete = async (item: { id: string; source: "supabase" | "local" }) => {
    if (item.source === "local") {
      const updated = localSchedules.filter((s) => s.id !== item.id);
      setLocalSchedules(updated);
      writeLocalSchedules(updated);
      return;
    }
    await supabase.from("schedules").delete().eq("id", item.id);
    await fetchSchedules(year, month);
  };

  const isToday = (d: number | null) =>
    d !== null &&
    year === today.getFullYear() &&
    month === today.getMonth() &&
    d === today.getDate();

  const isSelected = (d: number | null) =>
    d !== null &&
    selectedDate?.y === year &&
    selectedDate?.m === month &&
    selectedDate?.d === d;

  const isTodayDate = (date: Date) =>
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  const isSelectedDate = (date: Date) =>
    selectedDateObj !== null &&
    date.getFullYear() === selectedDateObj.getFullYear() &&
    date.getMonth() === selectedDateObj.getMonth() &&
    date.getDate() === selectedDateObj.getDate();

  const persistNoteCards = (nextCards: LocalNoteCard[]) => {
    if (!selectedDate) return;
    const key = formatLocalDateYYYYMMDD(
      selectedDate.y,
      selectedDate.m,
      selectedDate.d
    );
    const updated = [...notes];
    const idx = updated.findIndex((n) => n.date === key);
    const cleaned = nextCards.filter(
      (c) => c.content.trim().length > 0 || c.tags.length > 0
    );
    if (cleaned.length === 0) {
      if (idx !== -1) updated.splice(idx, 1);
    } else {
      const next: LocalDayNotes = { date: key, cards: cleaned };
      if (idx === -1) updated.push(next);
      else updated[idx] = next;
    }
    setNotes(updated);
    writeLocalNotes(updated);
    // Sync to cloud
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      fetch("/api/notes/day", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ date: key, cards: cleaned }),
      }).catch(() => { /* ignore network errors */ });
    });
  };

  const handleAddCard = () => {
    const next = [
      ...noteCards,
      { id: crypto.randomUUID(), content: "", tags: [] },
    ];
    setNoteCards(next);
    // don't persist empty card yet; it will persist after typing/tagging
  };

  const handleUpdateCardContent = (cardId: string, content: string) => {
    const next = noteCards.map((c) => (c.id === cardId ? { ...c, content } : c));
    setNoteCards(next);
  };

  const handleAddCardTag = (cardId: string, tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    const next = noteCards.map((c) => {
      if (c.id !== cardId) return c;
      if (c.tags.includes(trimmed)) return c;
      return { ...c, tags: [...c.tags, trimmed] };
    });
    setNoteCards(next);
    persistNoteCards(next);
  };

  const handleRemoveCardTag = (cardId: string, tag: string) => {
    const next = noteCards.map((c) => {
      if (c.id !== cardId) return c;
      return { ...c, tags: c.tags.filter((t) => t !== tag) };
    });
    setNoteCards(next);
    persistNoteCards(next);
  };

  const handleDeleteCard = (cardId: string) => {
    const next = noteCards.filter((c) => c.id !== cardId);
    setNoteCards(next);
    persistNoteCards(next);
  };

  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            日历 · 日程
          </h1>
          {mode === "month" ? (
            <p className="text-sm text-muted-foreground">
              选择一个日期查看当日安排
            </p>
          ) : selectedDate ? (
            <p className="text-sm text-muted-foreground">
              {selectedDate.y} 年 {selectedDate.m + 1} 月 {selectedDate.d} 日
            </p>
          ) : null}
        </div>
        <Button
          size="sm"
          className="rounded-2xl"
          onClick={() => setShowAddForm((v) => !v)}
        >
          <Plus className="size-4" />
          添加日程
        </Button>
      </header>

      {showAddForm && mode === "month" && (
        <section className="rounded-2xl border border-border/70 bg-card p-4">
          <form onSubmit={handleAddSchedule} className="space-y-3">
            <div>
              <label className="text-sm font-medium">标题</label>
              <input
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                placeholder="例如：体检"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">日期</label>
              <input
                type="date"
                value={addDate}
                onChange={(e) => setAddDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">开始时间</label>
              <input
                type="time"
                value={addStart}
                onChange={(e) => setAddStart(e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </div>
            <div>
              <label className="text-sm font-medium">结束时间</label>
              <input
                type="time"
                value={addEnd}
                onChange={(e) => setAddEnd(e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => setShowAddForm(false)}
              >
                取消
              </Button>
              <Button type="submit" className="rounded-xl" disabled={addSubmitting}>
                {addSubmitting ? "提交中…" : "保存"}
              </Button>
            </div>
          </form>
        </section>
      )}

      {mode === "month" && (
        <section className="min-h-[60vh] rounded-2xl border border-border/70 bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="上一月"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="font-display text-lg font-semibold">
            {year}年{month + 1}月
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="下一月"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/60">
          <table className="w-full table-fixed border-collapse text-xs">
            <thead>
              <tr>
                {WEEKDAYS.map((w) => (
                  <th
                    key={w}
                    className="border-b border-border/60 bg-muted/60 py-1.5 text-center text-[11px] font-medium text-muted-foreground"
                  >
                    {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, row) => (
                <tr key={row}>
                  {gridDates
                    .slice(row * 7, row * 7 + 7)
                    .map((date, colIdx) => {
                    const inMonth = date.getMonth() === month;
                      const day = date.getDate();
                      const hasEvents = inMonth && daysWithSchedules.has(day);
                      const selected = isSelectedDate(date);
                      const todayCell = isTodayDate(date);
                      const previews =
                        dayPreviewMap.get(
                          keyLocalDay(date.getFullYear(), date.getMonth(), date.getDate())
                        ) ?? [];
                    return (
                      <td
                        key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
                        className="h-14 border-b border-r border-border/40 align-top"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            // If clicking an overflow date, jump to that month context
                            if (date.getFullYear() !== year) setYear(date.getFullYear());
                            if (date.getMonth() !== month) setMonth(date.getMonth());
                            setSelectedDateObj(date);
                            setSelectedDate({
                              y: date.getFullYear(),
                              m: date.getMonth(),
                              d: date.getDate(),
                            });
                            setMode("day");
                          }}
                          className={cn(
                            "flex h-full w-full flex-col px-1.5 pb-1.5 pt-1 text-left transition-colors",
                            !selected && !todayCell && "hover:bg-muted/60",
                            selected && "bg-primary/10",
                            todayCell && "bg-primary/10",
                          )}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className={cn(
                                "font-display text-[12px] font-semibold",
                                todayCell && "text-primary",
                                !inMonth && "text-muted-foreground/60"
                              )}
                            >
                              {day}
                            </span>
                            {hasEvents && (
                              <span
                                className="inline-flex h-1.5 w-1.5 rounded-full bg-calendar-dot"
                                aria-hidden
                              />
                            )}
                          </div>

                          {/* Up to 2 schedule previews */}
                          {previews.length > 0 ? (
                            <div className="mt-1 space-y-0.5">
                              {previews.slice(0, 2).map((p, idx) => (
                                <div
                                  key={`${idx}-${p.start_time}`}
                                  className={cn(
                                    "truncate rounded-md px-1 py-0.5 text-[10px] leading-tight",
                                    "bg-calendar-dot/15 text-foreground/80"
                                  )}
                                  title={p.title}
                                >
                                  {p.title}
                                </div>
                              ))}
                              {previews.length > 2 ? (
                                <div className="px-1 text-[10px] text-muted-foreground">
                                  +{previews.length - 2}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && (
          <div className="mt-2 text-center text-xs text-muted-foreground">
            加载中…
          </div>
        )}
      </section>
      )}

      {mode === "day" && selectedDate && (
        <section className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">
              {selectedDate.y} 年 {selectedDate.m + 1} 月 {selectedDate.d} 日
            </h2>
            <Button
              variant="outline"
              size="sm"
              className="rounded-2xl"
              onClick={() => setMode("month")}
            >
              返回月历
            </Button>
          </div>

          {!isAuthed ? (
            <div className="mb-3 rounded-2xl border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
              你当前未登录：新增/删除的日程会临时保存在本机浏览器里（后续登录后再接入云端同步）。
            </div>
          ) : null}

          <form onSubmit={handleDayAdd} className="space-y-3">
            <div>
              <label className="text-sm font-medium">新增日程</label>
              <input
                value={dayTitle}
                onChange={(e) => setDayTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                placeholder="例如：亲子阅读"
              />
            </div>
            <div>
              <label className="text-sm font-medium">开始时间</label>
              <input
                type="time"
                value={dayStart}
                onChange={(e) => setDayStart(e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </div>
            <div>
              <label className="text-sm font-medium">结束时间</label>
              <input
                type="time"
                value={dayEnd}
                onChange={(e) => setDayEnd(e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </div>
            <Button type="submit" className="w-full rounded-2xl" disabled={daySubmitting}>
              {daySubmitting ? "保存中…" : "保存日程"}
            </Button>
          </form>

          {selectedDaySchedules.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">当天暂无日程</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {selectedDaySchedules.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2"
                >
                  <span className="text-sm font-medium text-foreground tabular-nums">
                    {formatTime(s.start_time)}
                    {s.end_time && ` – ${formatTime(s.end_time)}`}
                  </span>
                  <span className="text-sm">{scheduleDisplayTitle(s)}</span>
                  <button
                    type="button"
                    onClick={() => handleDayDelete({ id: s.id, source: (s as any).source })}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">小记事卡片</div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-2xl"
                onClick={handleAddCard}
              >
                增加小卡片
              </Button>
            </div>

            <div className="space-y-3">
              {noteCards.length === 0 ? (
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
                  还没有小记事卡片。点击「增加小卡片」开始记录。
                </div>
              ) : (
                noteCards.map((card) => (
                  <div
                    key={card.id}
                    className="rounded-2xl border border-border/70 bg-background p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-muted-foreground">
                        卡片
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCard(card.id)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        删除
                      </button>
                    </div>

                    <textarea
                      value={card.content}
                      onChange={(e) =>
                        handleUpdateCardContent(card.id, e.target.value)
                      }
                      onBlur={() => persistNoteCards(noteCards)}
                      rows={3}
                      className="mt-2 w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      placeholder="写下一个主题（例如：运动 / 英语 / 情绪）…"
                    />

                    <div className="mt-2 space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {card.tags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => handleRemoveCardTag(card.id, tag)}
                            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/80"
                          >
                            <span>#{tag}</span>
                            <span className="text-[10px]">×</span>
                          </button>
                        ))}
                      </div>

                      <input
                        defaultValue=""
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const target = e.target as HTMLInputElement;
                            const value = target.value;
                            handleAddCardTag(card.id, value);
                            target.value = "";
                          }
                        }}
                        className="h-8 w-full rounded-full border border-input bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                        placeholder="输入标签后回车（这条卡片专属）"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">里程碑</div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-2xl"
                onClick={handleAddMilestone}
              >
                增加里程碑记录
              </Button>
            </div>

            {dayMilestones.length === 0 ? (
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
                还没有里程碑记录。点击「增加里程碑记录」开始记录。
              </div>
            ) : (
              <div className="space-y-3">
                {dayMilestones.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-2xl border border-border/70 bg-background p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-muted-foreground">
                        里程碑记录
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteMilestone(m.id)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        删除
                      </button>
                    </div>

                    <textarea
                      value={m.content}
                      onChange={(e) =>
                        handleUpdateMilestoneContent(m.id, e.target.value)
                      }
                      onBlur={() => persistMilestones(milestones)}
                      rows={2}
                      className="mt-2 w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      placeholder="记录今天在某个目标上的突破或关键节点…"
                    />

                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        关联目标：
                      </span>
                      <select
                        value={m.goalId ?? ""}
                        onChange={(e) =>
                          handleUpdateMilestoneGoal(m.id, e.target.value)
                        }
                        className="h-8 flex-1 rounded-xl border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        <option value="">（可选）暂不关联目标</option>
                        {milestoneGoals.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
