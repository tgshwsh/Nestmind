"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Plus } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Resource = {
  id: string;
  title: string;
  resource_type: "book" | "audio" | "tool" | "activity";
  cover_url: string | null;
  target_audience: "baby" | "parent";
  category: { name: string } | null;
  level: { name: string } | null;
  source_url: string | null;
  created_at: string;
  tags: { id: string; name: string }[];
};

type Category = { id: string; name: string };
type Level = { id: string; name: string; sequence: number };

const TYPE_LABEL: Record<Resource["resource_type"], string> = {
  book: "书籍",
  audio: "音频",
  tool: "教具",
  activity: "活动",
};

export default function ResourcesPage() {
  const [items, setItems] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeLevel, setActiveLevel] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [activeAudience, setActiveAudience] = useState<"baby" | "parent">(
    "baby"
  );

  const [categories, setCategories] = useState<Category[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [familyId, setFamilyId] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState<Resource["resource_type"]>("book");
  const [formCategoryId, setFormCategoryId] = useState<string>("");
  const [formLevelId, setFormLevelId] = useState<string>("");
  const [formSourceUrl, setFormSourceUrl] = useState("");
  const [formTagInput, setFormTagInput] = useState("");
  const [formTags, setFormTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newLevelName, setNewLevelName] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      // resources + tags via relation table
      const { data, error } = await supabase
        .from("resources")
        .select(
          `
          id,
          title,
          resource_type,
          cover_url,
          target_audience,
          source_url,
          created_at,
          category:resource_categories(name),
          level:resource_levels(name),
          resource_tag_relations(
            tags(id,name)
          )
        `
        )
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      const normalized: Resource[] = (data ?? []).map((r: any) => {
        const rel = Array.isArray(r.resource_tag_relations)
          ? r.resource_tag_relations
          : [];
        const tags = rel
          .map((x: any) => x?.tags)
          .filter(Boolean)
          .map((t: any) => ({ id: t.id, name: t.name }));
        return {
          id: r.id,
          title: r.title,
          resource_type: r.resource_type,
          cover_url: r.cover_url ?? null,
          target_audience: r.target_audience ?? "baby",
          category: r.category ?? null,
          level: r.level ?? null,
          source_url: r.source_url ?? null,
          created_at: r.created_at,
          tags,
        };
      });

      setItems(normalized);
      setLoading(false);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Ensure bootstrap has been run so RLS can work (family_id exists)
    let cancelled = false;
    async function ensureBootstrap() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;

      const res = await fetch("/api/bootstrap", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (cancelled) return;
      setFamilyId(json?.family_id ?? null);
    }
    ensureBootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadDict() {
      const { data: cats, error: catErr } = await supabase
        .from("resource_categories")
        .select("id,name")
        .order("name", { ascending: true });
      if (cancelled) return;
      if (catErr) {
        setError(catErr.message);
        return;
      }
      setCategories((cats as Category[]) ?? []);
    }
    loadDict();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadLevels(categoryId: string) {
      if (!categoryId) {
        setLevels([]);
        return;
      }
      const { data, error } = await supabase
        .from("resource_levels")
        .select("id,name,sequence")
        .eq("category_id", categoryId)
        .order("sequence", { ascending: true })
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      setLevels((data as Level[]) ?? []);
    }
    loadLevels(formCategoryId);
    return () => {
      cancelled = true;
    };
  }, [formCategoryId]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach((r) => r.tags.forEach((t) => set.add(t.name)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [items]);

  const allLevels = useMemo(() => {
    const set = new Set<string>();
    items.forEach((r) => {
      if (r.level?.name) set.add(r.level.name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [items]);

  const categoriesById = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  const levelsForActiveCategory = useMemo(() => {
    if (!activeCategoryId) return [];
    const categoryName = categoriesById.get(activeCategoryId);
    if (!categoryName) return [];
    const set = new Set<string>();
    items.forEach((r) => {
      if (r.category?.name !== categoryName) return;
      if (r.target_audience !== activeAudience) return;
      if (r.level?.name) set.add(r.level.name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [activeCategoryId, categoriesById, items, activeAudience]);

  const filtered = useMemo(() => {
    return items.filter((r) => {
      const okAudience = r.target_audience === activeAudience;
      const okTag = activeTag
        ? r.tags.some((t) => t.name === activeTag)
        : true;
      const okLevel = activeLevel ? r.level?.name === activeLevel : true;
      const okCategory = activeCategoryId
        ? r.category?.name === categoriesById.get(activeCategoryId)
        : true;
      return okAudience && okTag && okCategory && okLevel;
    });
  }, [items, activeTag, activeLevel, activeAudience, activeCategoryId, categoriesById]);

  async function refreshResources() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("resources")
      .select(
        `
        id,
        title,
        resource_type,
        cover_url,
        target_audience,
        source_url,
        created_at,
        category:resource_categories(name),
        level:resource_levels(name),
        resource_tag_relations(tags(id,name))
      `
      )
      .order("created_at", { ascending: false });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const normalized: Resource[] = (data ?? []).map((r: any) => {
      const rel = Array.isArray(r.resource_tag_relations)
        ? r.resource_tag_relations
        : [];
      const tags = rel
        .map((x: any) => x?.tags)
        .filter(Boolean)
        .map((t: any) => ({ id: t.id, name: t.name }));
      return {
        id: r.id,
        title: r.title,
        resource_type: r.resource_type,
        cover_url: r.cover_url ?? null,
        target_audience: r.target_audience ?? "baby",
        category: r.category ?? null,
        level: r.level ?? null,
        source_url: r.source_url ?? null,
        created_at: r.created_at,
        tags,
      };
    });
    setItems(normalized);
    setLoading(false);
  }

  async function onAddResource(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload: any = {
        title: formTitle.trim(),
        resource_type: formType,
        target_audience: activeAudience,
        cover_url: null,
        source_url: formSourceUrl.trim() || null,
        category_id: formCategoryId || null,
        level_id: formLevelId || null,
        tags: formTags,
      };

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setError("未登录：请先在 /login 登录后再添加资源");
        setSubmitting(false);
        return;
      }

      const res = await fetch("/api/resources/create", {
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
        setError(json?.error ?? "添加失败");
        setSubmitting(false);
        return;
      }

      setFormTitle("");
      setFormType("book");
      setFormCategoryId("");
      setFormLevelId("");
      setFormSourceUrl("");
      setFormTagInput("");
      setFormTags([]);
      setShowAdd(false);

      await refreshResources();
      setSubmitting(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "添加失败");
      setSubmitting(false);
    }
  }

  async function addCategory() {
    setError(null);
    const name = newCategoryName.trim();
    if (!name) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { setError("请先登录"); return; }

    // Bootstrap first if no family yet
    if (!familyId) {
      const bRes = await fetch("/api/bootstrap", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const bJson = (await bRes.json()) as { ok?: boolean; family_id?: string; error?: string };
      if (!bJson?.ok || !bJson.family_id) {
        setError(bJson?.error ?? "初始化失败，请重试");
        return;
      }
      setFamilyId(bJson.family_id);
    }

    // Use API route (admin client) to bypass RLS
    const res = await fetch("/api/resources/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    });
    const json = (await res.json()) as { ok?: boolean; category?: Category; error?: string };
    if (!json?.ok) {
      setCategoryError(json?.error ?? "添加学科失败");
      return;
    }
    setCategoryError(null);
    setNewCategoryName("");
    if (json.category) {
      setCategories((prev) => [...prev, json.category!].sort((a, b) => a.name.localeCompare(b.name)));
    }
  }

  async function addLevel() {
    setError(null);
    const name = newLevelName.trim();
    if (!name || !formCategoryId) return;
    const { error } = await supabase.from("resource_levels").insert({
      category_id: formCategoryId,
      name,
      sequence: 0,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setNewLevelName("");
    const { data } = await supabase
      .from("resource_levels")
      .select("id,name,sequence")
      .eq("category_id", formCategoryId)
      .order("sequence", { ascending: true })
      .order("name", { ascending: true });
    setLevels((data as Level[]) ?? []);
  }

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          资料库 / 资源
        </h1>
        <p className="text-sm text-muted-foreground">
          这一版完成：受众分区（宝宝书房/我的收藏）+ 学科/等级字典级联 + URL
          字段。
        </p>
      </header>

      <section className="rounded-2xl border border-border/70 bg-card p-2">
        <div className="grid grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setActiveAudience("baby");
            }}
            className={cn(
              "rounded-2xl px-3 py-2 text-sm font-medium transition-colors",
              activeAudience === "baby"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted/60"
            )}
          >
            宝宝书房
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveAudience("parent");
            }}
            className={cn(
              "rounded-2xl px-3 py-2 text-sm font-medium transition-colors",
              activeAudience === "parent"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted/60"
            )}
          >
            我的收藏
          </button>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">添加资源</div>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-2xl bg-secondary px-3 text-xs font-medium text-secondary-foreground"
          >
            <Plus className="size-4" />
            {showAdd ? "收起" : "添加资源"}
          </button>
        </div>

        {showAdd ? (
          <form onSubmit={onAddResource} className="space-y-3">
            <div>
              <label className="text-sm font-medium">标题</label>
              <input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                placeholder="例如：牛津树 Level 1"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">类型</label>
                <select
                  value={formType}
                  onChange={(e) =>
                    setFormType(e.target.value as Resource["resource_type"])
                  }
                  className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <option value="book">书籍</option>
                  <option value="audio">音频</option>
                  <option value="tool">教具</option>
                  <option value="activity">活动</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">学科（Category）</label>
                <select
                  value={formCategoryId}
                  onChange={(e) => {
                    setFormCategoryId(e.target.value);
                    setFormLevelId("");
                  }}
                  className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <option value="">（可选）不选择</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                {/* Always visible: add new category */}
                <div className="mt-2 flex gap-2">
                  <input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } }}
                    className="h-8 flex-1 rounded-xl border border-input bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    placeholder="新增学科…"
                  />
                  <button
                    type="button"
                    onClick={addCategory}
                    disabled={!newCategoryName.trim()}
                    className="inline-flex h-8 items-center justify-center rounded-xl bg-secondary px-3 text-xs font-medium text-secondary-foreground disabled:opacity-40"
                  >
                    新增
                  </button>
                </div>
                {categoryError ? (
                  <p className="mt-1 text-xs text-destructive">{categoryError}</p>
                ) : null}
              </div>

              <div>
                <label className="text-sm font-medium">等级（Level）</label>
                <select
                  value={formLevelId}
                  onChange={(e) => setFormLevelId(e.target.value)}
                  disabled={!formCategoryId}
                  className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
                >
                  <option value="">
                    {formCategoryId ? "选择等级…" : "先选择学科"}
                  </option>
                  {levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>

                {formCategoryId && levels.length === 0 ? (
                  <div className="mt-2 space-y-2">
                    <div className="text-xs text-muted-foreground">
                      该学科还没有等级。你可以先新增一个等级。
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={newLevelName}
                        onChange={(e) => setNewLevelName(e.target.value)}
                        className="h-9 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                        placeholder="例如：蓝思 200L"
                      />
                      <button
                        type="button"
                        onClick={addLevel}
                        className="inline-flex h-9 items-center justify-center rounded-xl bg-secondary px-3 text-sm font-medium text-secondary-foreground"
                      >
                        新增
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">外部链接（可选）</label>
              <input
                value={formSourceUrl}
                onChange={(e) => setFormSourceUrl(e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                placeholder="例如：https://mp.weixin.qq.com/..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">标签（可选）</label>
              <div className="flex flex-wrap gap-1.5">
                {formTags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFormTags((prev) => prev.filter((x) => x !== t))}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/80"
                  >
                    <span>#{t}</span>
                    <span className="text-[10px]">×</span>
                  </button>
                ))}
              </div>
              <input
                value={formTagInput}
                onChange={(e) => setFormTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const v = formTagInput.trim();
                    if (!v) return;
                    setFormTags((prev) => (prev.includes(v) ? prev : [...prev, v]));
                    setFormTagInput("");
                  }
                }}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                placeholder="输入标签后回车，例如：天文、自然科学…"
              />
              <div className="text-xs text-muted-foreground">
                提示：回车即可添加；点击标签可删除。
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 w-full items-center justify-center rounded-2xl bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {submitting ? "保存中…" : "保存资源"}
            </button>

            {error ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </form>
        ) : (
          <div className="text-sm text-muted-foreground">
            点击右侧「添加资源」开始录入。
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-4">
        <div className="space-y-2">
          <div className="text-sm font-medium">按学科筛选</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveCategoryId(null);
                setActiveLevel(null);
              }}
              className={cn(
                "rounded-full px-3 py-1 text-xs",
                activeCategoryId === null
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              全部
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setActiveCategoryId(c.id);
                  setActiveLevel(null);
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-xs",
                  activeCategoryId === c.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {activeCategoryId ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">按 Level 筛选（子筛选）</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveLevel(null)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs",
                  activeLevel === null
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                全部
              </button>
              {levelsForActiveCategory.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setActiveLevel(lvl)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs",
                    activeLevel === lvl
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="text-sm font-medium">按 Tag 筛选</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className={cn(
                "rounded-full px-3 py-1 text-xs",
                activeTag === null
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              全部
            </button>
            {allTags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTag(t)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs",
                  activeTag === t
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                #{t}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </section>
      ) : null}

      {loading ? (
        <section className="rounded-2xl border border-border/70 bg-card p-4 text-sm text-muted-foreground">
          加载中…
        </section>
      ) : filtered.length === 0 ? (
        <section className="rounded-2xl border border-border/70 bg-card p-4 text-sm text-muted-foreground">
          暂无资源（或筛选结果为空）。你可以先点击上方「添加资源」录入一条。
        </section>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((r) => (
            <Link
              key={r.id}
              href={`/resources/${r.id}`}
              className="overflow-hidden rounded-2xl border border-border/70 bg-card transition-colors hover:bg-muted/40"
            >
              <div className="space-y-2 p-3">
                <div className="line-clamp-2 text-sm font-medium">{r.title}</div>
                <div className="flex flex-wrap gap-1">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {TYPE_LABEL[r.resource_type]}
                  </span>
                  {r.level?.name ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {r.level.name}
                    </span>
                  ) : null}
                  {r.category?.name ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {r.category.name}
                    </span>
                  ) : null}
                </div>
                {r.source_url ? (
                  <div className="truncate text-[11px] text-muted-foreground">
                    {r.source_url}
                  </div>
                ) : null}
                {r.tags.length ? (
                  <div className="flex flex-wrap gap-1">
                    {r.tags.slice(0, 3).map((t) => (
                      <span
                        key={t.id}
                        className="rounded-full bg-calendar-dot/15 px-2 py-0.5 text-[11px] text-foreground/80"
                      >
                        #{t.name}
                      </span>
                    ))}
                    {r.tags.length > 3 ? (
                      <span className="text-[11px] text-muted-foreground">
                        +{r.tags.length - 3}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

