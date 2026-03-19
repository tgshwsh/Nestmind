import { NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type PayloadItem = {
  localId: string;
  title: string;
  start_time: string;
  end_time: string | null;
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

    // Ensure the app user has a family_id (bootstrap if needed)
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

    const body = (await request.json()) as { items?: PayloadItem[] };
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return NextResponse.json({ ok: true, mappings: [] });

    // Insert schedules. (We keep it simple: always insert; client will mark as synced)
    const toInsert = items.map((i) => ({
      family_id: familyId,
      title: i.title,
      start_time: i.start_time,
      end_time: i.end_time,
      is_recurring: false,
      created_by: user.id,
    }));

    const { data: inserted, error: insertError } = await admin
      .from("schedules")
      .insert(toInsert)
      .select("id");
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    const mappings = items.map((i, idx) => ({
      localId: i.localId,
      scheduleId: inserted?.[idx]?.id ?? null,
    }));

    return NextResponse.json({ ok: true, mappings });
  } catch (e) {
    const message = e instanceof Error ? e.message : "sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

