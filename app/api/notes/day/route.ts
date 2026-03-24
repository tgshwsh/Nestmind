import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type CardInput = { id: string; content: string; tags: string[] };

/**
 * PUT /api/notes/day
 * Replace all note cards for one calendar day (idempotent upsert + delete stale).
 * Body: { date: "YYYY-MM-DD", cards: CardInput[] }
 */
export async function PUT(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const header =
      request.headers.get("authorization") ?? request.headers.get("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: { user } } = await createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).auth.getUser(token);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("family_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.family_id)
      return NextResponse.json({ error: "no family" }, { status: 400 });

    const body = (await request.json()) as { date?: string; cards?: CardInput[] };
    const date = body.date?.trim();
    if (!date) return NextResponse.json({ error: "missing date" }, { status: 400 });

    const cards = Array.isArray(body.cards) ? body.cards : [];
    const validCards = cards.filter(
      (c) => c.id && (c.content.trim() || c.tags.length > 0)
    );

    // Delete all existing notes for this family + date that are NOT in the new list
    const keepIds = validCards.map((c) => c.id);
    if (keepIds.length > 0) {
      await admin
        .from("day_notes")
        .delete()
        .eq("family_id", profile.family_id)
        .eq("note_date", date)
        .not("id", "in", `(${keepIds.join(",")})`);
    } else {
      // No cards left — delete everything for this day
      await admin
        .from("day_notes")
        .delete()
        .eq("family_id", profile.family_id)
        .eq("note_date", date);
    }

    if (validCards.length > 0) {
      const rows = validCards.map((c) => ({
        id: c.id,
        family_id: profile.family_id,
        note_date: date,
        content: c.content.trim(),
        tags: c.tags.map((t) => t.trim()).filter(Boolean),
        created_by: user.id,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await admin
        .from("day_notes")
        .upsert(rows, { onConflict: "id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 }
    );
  }
}
