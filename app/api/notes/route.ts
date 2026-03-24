import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function resolveUser(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const header =
    request.headers.get("authorization") ?? request.headers.get("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const { data: { user } } = await createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.getUser(token);
  return user ?? null;
}

/** GET /api/notes?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(request: NextRequest) {
  try {
    const user = await resolveUser(request);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("family_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.family_id)
      return NextResponse.json({ error: "no family" }, { status: 400 });

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let query = admin
      .from("day_notes")
      .select("id, note_date, content, tags, created_at")
      .eq("family_id", profile.family_id)
      .order("note_date", { ascending: false });

    if (from) query = query.gte("note_date", from);
    if (to) query = query.lte("note_date", to);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 }
    );
  }
}
