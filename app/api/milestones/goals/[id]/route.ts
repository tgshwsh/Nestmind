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

/** DELETE /api/milestones/goals/[id] */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const ctx = await getAuthedFamily(request);
    if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { admin, familyId } = ctx;

    await admin.from("milestone_records").delete()
      .eq("milestone_id", id).eq("family_id", familyId);
    await admin.from("milestones").delete()
      .eq("id", id).eq("family_id", familyId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
