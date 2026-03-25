import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function getAuthedFamily(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const { data: { user } } = await createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.getUser(token);
  if (!user) return null;
  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("users").select("family_id").eq("id", user.id).maybeSingle();
  return profile?.family_id ? { admin, familyId: profile.family_id as string } : null;
}

/** PUT /api/milestones/goals  — create or update a goal */
export async function PUT(request: Request) {
  try {
    const ctx = await getAuthedFamily(request);
    if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { admin, familyId } = ctx;

    const body = (await request.json()) as {
      id?: string; title?: string; description?: string;
    };
    const title = body.title?.trim();
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
    const description = body.description?.trim() ?? "";

    if (body.id) {
      // Update — try with description, fall back without
      let data: { id: string; title: string } | null = null;
      let error: { message: string } | null = null;
      ({ data, error } = await admin
        .from("milestones")
        .update({ title, description })
        .eq("id", body.id)
        .eq("family_id", familyId)
        .select("id, title")
        .single() as any);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, goal: { ...data, description } });
    }

    // Create — do NOT include created_by (not in original schema)
    // Try with description first (needs SQL migration), fall back without
    let insertData: { id: string; title: string } | null = null;
    let insertError: { message: string } | null = null;
    ({ data: insertData, error: insertError } = await admin
      .from("milestones")
      .insert({ family_id: familyId, title, description, expected_month: null, is_achieved: false, achieved_date: null })
      .select("id, title")
      .single() as any);

    if (insertError) {
      // Retry without description (column may not exist)
      ({ data: insertData, error: insertError } = await admin
        .from("milestones")
        .insert({ family_id: familyId, title, expected_month: null, is_achieved: false, achieved_date: null })
        .select("id, title")
        .single() as any);
    }
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    return NextResponse.json({ ok: true, goal: { ...insertData, description } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
