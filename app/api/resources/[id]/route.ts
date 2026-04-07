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
  return profile?.family_id
    ? { admin, familyId: profile.family_id as string }
    : null;
}

/** DELETE /api/resources/[id]
 *  Deletes the resource AND all schedules that reference it.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

    const ctx = await getAuthedFamily(request);
    if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { admin, familyId } = ctx;

    // Verify resource belongs to this family
    const { data: res } = await admin
      .from("resources")
      .select("id")
      .eq("id", id)
      .eq("family_id", familyId)
      .maybeSingle();
    if (!res) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Delete all schedules that reference this resource
    const { error: schedErr } = await admin
      .from("schedules")
      .delete()
      .eq("resource_id", id);
    if (schedErr) return NextResponse.json({ error: schedErr.message }, { status: 500 });

    // Delete the resource itself
    const { error: resErr } = await admin
      .from("resources")
      .delete()
      .eq("id", id);
    if (resErr) return NextResponse.json({ error: resErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
