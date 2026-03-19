import { NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Goal = {
  localGoalId: string;
  title: string;
};

type RecordItem = {
  localRecordId: string;
  date: string; // YYYY-MM-DD
  goalLocalId: string | null;
  content: string;
};

export async function POST(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ error: "missing supabase env" }, { status: 500 });
    }

    const headerValue =
      request.headers.get("authorization") ?? request.headers.get("Authorization");
    const token = headerValue?.startsWith("Bearer ") ? headerValue.slice(7) : null;
    if (!token) return NextResponse.json({ error: "missing bearer token" }, { status: 401 });

    const supabaseAuth = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const admin = createSupabaseAdminClient();

    // Ensure family_id
    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("id,family_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

    let familyId = profile?.family_id as string | null | undefined;
    if (!familyId) {
      const { data: family, error: familyError } = await admin
        .from("families")
        .insert({ name: "我的家庭" })
        .select("id")
        .single();
      if (familyError) return NextResponse.json({ error: familyError.message }, { status: 500 });

      const { error: upsertError } = await admin.from("users").upsert({
        id: user.id,
        family_id: family.id,
        role: "parent",
      });
      if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
      familyId = family.id;
    }

    const body = (await request.json()) as { goals?: Goal[]; records?: RecordItem[] };
    const goals = Array.isArray(body.goals) ? body.goals : [];
    const records = Array.isArray(body.records) ? body.records : [];

    // 1) Upsert goals into milestones and build local->db id map
    const goalIdMap = new Map<string, string>();
    for (const g of goals) {
      const title = String(g.title ?? "").trim();
      if (!g.localGoalId || !title) continue;

      // We keep it simple: create a milestone row per goal title (scoped by family)
      // If duplicates exist, we reuse the first found.
      const { data: existing } = await admin
        .from("milestones")
        .select("id")
        .eq("family_id", familyId)
        .eq("title", title)
        .maybeSingle();

      if (existing?.id) {
        goalIdMap.set(g.localGoalId, existing.id);
        continue;
      }

      const { data: created, error: createError } = await admin
        .from("milestones")
        .insert({
          family_id: familyId,
          title,
          expected_month: null,
          is_achieved: false,
          achieved_date: null,
        })
        .select("id")
        .single();
      if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });
      goalIdMap.set(g.localGoalId, created.id);
    }

    // 2) Insert milestone records as records, then relate to milestone if selected
    const recordMappings: { localRecordId: string; recordId: string }[] = [];

    for (const r of records) {
      const content = String(r.content ?? "").trim();
      if (!r.localRecordId || !r.date || !content) continue;

      const { data: record, error: recordError } = await admin
        .from("records")
        .insert({
          family_id: familyId,
          schedule_id: null,
          content,
          media_urls: [],
          created_by: user.id,
        })
        .select("id,created_at")
        .single();
      if (recordError) return NextResponse.json({ error: recordError.message }, { status: 500 });

      recordMappings.push({ localRecordId: r.localRecordId, recordId: record.id });

      const milestoneId = r.goalLocalId ? goalIdMap.get(r.goalLocalId) : null;
      if (milestoneId) {
        await admin.from("record_milestone_relations").upsert({
          record_id: record.id,
          milestone_id: milestoneId,
        });

        // Mark milestone achieved on that date (lightweight, no conflict handling)
        await admin
          .from("milestones")
          .update({ is_achieved: true, achieved_date: r.date })
          .eq("id", milestoneId);
      }
    }

    const goalMappings = Array.from(goalIdMap.entries()).map(([localGoalId, milestoneId]) => ({
      localGoalId,
      milestoneId,
    }));

    return NextResponse.json({ ok: true, goalMappings, recordMappings });
  } catch (e) {
    const message = e instanceof Error ? e.message : "sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

