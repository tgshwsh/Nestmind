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

/** PUT /api/milestones/goals  — create or update a goal */
export async function PUT(request: Request) {
  try {
    const ctx = await getAuthedFamily(request);
    if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { user, admin, familyId } = ctx;

    const body = (await request.json()) as {
      id?: string; title?: string; description?: string;
    };
    const title = body.title?.trim();
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

    let goal: { id: string; title: string; description: string };
    if (body.id) {
      // Update existing
      const { data, error } = await admin
        .from("milestones")
        .update({ title, description: body.description?.trim() ?? "" })
        .eq("id", body.id)
        .eq("family_id", familyId)
        .select("id, title, description")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      goal = data;
    } else {
      // Create new
      const { data, error } = await admin
        .from("milestones")
        .insert({
          family_id: familyId,
          title,
          description: body.description?.trim() ?? "",
          expected_month: null,
          is_achieved: false,
          achieved_date: null,
          created_by: user.id,
        })
        .select("id, title, description")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      goal = data;
    }
    return NextResponse.json({ ok: true, goal });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
