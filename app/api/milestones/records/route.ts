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
  return profile?.family_id ? { user, admin, familyId: profile.family_id as string } : null;
}

/** POST /api/milestones/records — create a record */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthedFamily(request);
    if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { user, admin, familyId } = ctx;

    const body = (await request.json()) as {
      milestone_id?: string | null;
      record_date: string;
      content: string;
    };
    if (!body.record_date) return NextResponse.json({ error: "record_date required" }, { status: 400 });

    const { data, error } = await admin
      .from("milestone_records")
      .insert({
        family_id: familyId,
        milestone_id: body.milestone_id ?? null,
        record_date: body.record_date,
        content: body.content?.trim() ?? "",
        created_by: user.id,
      })
      .select("id, milestone_id, record_date, content")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, record: data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
