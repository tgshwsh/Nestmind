import { NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Payload = {
  title: string;
  resource_type: "book" | "audio" | "tool" | "activity";
  target_audience: "baby" | "parent";
  category_id: string | null;
  level_id: string | null;
  source_url: string | null;
  tags: string[];
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

    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("id,family_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

    const familyId = profile?.family_id as string | null | undefined;
    if (!familyId) {
      return NextResponse.json(
        { error: "missing family_id (run bootstrap first)" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as Payload;
    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "missing title" }, { status: 400 });

    const type = body.resource_type;
    const audience = body.target_audience;
    const categoryId = body.category_id ?? null;
    const levelId = body.level_id ?? null;
    const sourceUrl = body.source_url ? String(body.source_url).trim() : null;

    const { data: resource, error: resErr } = await admin
      .from("resources")
      .insert({
        family_id: familyId,
        title,
        resource_type: type,
        cover_url: null,
        target_audience: audience,
        category_id: categoryId,
        level_id: levelId,
        source_url: sourceUrl,
      })
      .select("id")
      .single();
    if (resErr) return NextResponse.json({ error: resErr.message }, { status: 500 });

    const tags = Array.isArray(body.tags) ? body.tags : [];
    const uniqueTags = Array.from(new Set(tags.map((t) => String(t).trim()).filter(Boolean)));
    for (const name of uniqueTags) {
      const { data: tagRow } = await admin
        .from("tags")
        .upsert({ name }, { onConflict: "name" })
        .select("id")
        .single();
      if (tagRow?.id) {
        await admin.from("resource_tag_relations").upsert({
          resource_id: resource.id,
          tag_id: tagRow.id,
        });
      }
    }

    return NextResponse.json({ ok: true, resourceId: resource.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

