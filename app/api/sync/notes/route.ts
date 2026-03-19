import { NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type NoteCard = {
  localCardId: string;
  content: string;
  tags: string[];
};

type DayNotes = {
  date: string; // YYYY-MM-DD
  cards: NoteCard[];
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

    // Ensure family_id
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

    const body = (await request.json()) as { days?: DayNotes[] };
    const days = Array.isArray(body.days) ? body.days : [];
    if (days.length === 0) return NextResponse.json({ ok: true, mappings: [] });

    const mappings: { localCardId: string; recordId: string }[] = [];

    for (const day of days) {
      const cards = Array.isArray(day.cards) ? day.cards : [];
      if (!day.date || cards.length === 0) continue;

      // Create records for each card
      for (const card of cards) {
        const content = String(card.content ?? "").trim();
        const tags = Array.isArray(card.tags) ? card.tags.map(String) : [];
        if (!content && tags.length === 0) continue;

        const { data: record, error: recordError } = await admin
          .from("records")
          .insert({
            family_id: familyId,
            schedule_id: null,
            content,
            media_urls: [],
            created_by: user.id,
            // created_at default now()
          })
          .select("id")
          .single();
        if (recordError) {
          return NextResponse.json({ error: recordError.message }, { status: 500 });
        }

        // Upsert tags and relations
        const uniqueTags = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
        for (const t of uniqueTags) {
          const { data: tagRow } = await admin
            .from("tags")
            .upsert({ name: t }, { onConflict: "name" })
            .select("id")
            .single();
          if (tagRow?.id) {
            await admin.from("record_tag_relations").upsert({
              record_id: record.id,
              tag_id: tagRow.id,
            });
          }
        }

        mappings.push({ localCardId: card.localCardId, recordId: record.id });
      }
    }

    return NextResponse.json({ ok: true, mappings });
  } catch (e) {
    const message = e instanceof Error ? e.message : "sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

