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
  return profile?.family_id ? { user, admin, familyId: profile.family_id as string } : null;
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

    // Goals (all, no date filter)
    const { data: goals, error: ge } = await admin
      .from("milestones")
      .select("id, title, description")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true });
    if (ge) return NextResponse.json({ error: ge.message }, { status: 500 });

    // Records (with optional date range)
    let rq = admin
      .from("milestone_records")
      .select("id, milestone_id, record_date, content")
      .eq("family_id", familyId)
      .order("record_date", { ascending: false });
    if (from) rq = rq.gte("record_date", from);
    if (to) rq = rq.lte("record_date", to);

    const { data: records, error: re } = await rq;
    if (re) return NextResponse.json({ error: re.message }, { status: 500 });

    return NextResponse.json({ ok: true, goals: goals ?? [], records: records ?? [] });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
