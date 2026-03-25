import { NextRequest, NextResponse } from "next/server";
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

/** GET /api/milestones?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthedFamily(request);
    if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { admin, familyId } = ctx;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // Goals — try selecting description (added by migration), fall back without
    let goals: { id: string; title: string; description?: string }[] = [];
    const { data: goalsWithDesc, error: ge1 } = await admin
      .from("milestones")
      .select("id, title, description")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true });

    if (ge1) {
      // description column may not exist yet — retry without it
      const { data: goalsBasic, error: ge2 } = await admin
        .from("milestones")
        .select("id, title")
        .eq("family_id", familyId)
        .order("created_at", { ascending: true });
      if (ge2) return NextResponse.json({ error: ge2.message }, { status: 500 });
      goals = goalsBasic ?? [];
    } else {
      goals = goalsWithDesc ?? [];
    }

    // Records — milestone_records table (created by migration)
    let records: { id: string; milestone_id: string | null; record_date: string; content: string }[] = [];
    let rq = admin
      .from("milestone_records")
      .select("id, milestone_id, record_date, content")
      .eq("family_id", familyId)
      .order("record_date", { ascending: false });
    if (from) rq = rq.gte("record_date", from);
    if (to) rq = rq.lte("record_date", to);

    const { data: recs, error: re } = await rq;
    // If table doesn't exist yet, return empty records rather than erroring out
    if (!re) records = recs ?? [];

    return NextResponse.json({ ok: true, goals, records });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
