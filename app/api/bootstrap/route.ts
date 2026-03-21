import { NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const admin = createSupabaseAdminClient();

    let inviteCode: string | null = null;
    try {
      const body = (await request.json()) as { invite_code?: string } | null;
      inviteCode = body?.invite_code?.trim() || null;
    } catch {
      // No body or invalid JSON - continue with normal flow
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ error: "missing supabase env" }, { status: 500 });
    }

    const headerValue =
      request.headers.get("authorization") ?? request.headers.get("Authorization");
    const token = headerValue?.startsWith("Bearer ") ? headerValue.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "missing bearer token" }, { status: 401 });
    }

    const supabaseAuth = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Check if public.users row exists (admin bypasses RLS)
    const { data: existing, error: existingError } = await admin
      .from("users")
      .select("id,family_id")
      .eq("id", user.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (existing?.family_id) {
      return NextResponse.json({ ok: true, family_id: existing.family_id });
    }

    let familyId: string;

    if (inviteCode) {
      const { data: invitedFamily, error: inviteErr } = await admin
        .from("families")
        .select("id")
        .eq("invite_code", inviteCode)
        .maybeSingle();

      if (inviteErr || !invitedFamily) {
        return NextResponse.json(
          { error: "邀请码无效或已过期" },
          { status: 400 }
        );
      }
      familyId = invitedFamily.id;
    } else {
      const { data: family, error: familyError } = await admin
        .from("families")
        .insert({ name: "我的家庭" })
        .select("id")
        .single();

      if (familyError) {
        return NextResponse.json({ error: familyError.message }, { status: 500 });
      }
      familyId = family.id;
    }

    // Upsert public.users
    const { error: upsertError } = await admin.from("users").upsert({
      id: user.id,
      family_id: familyId,
      role: "parent",
    });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, family_id: familyId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "bootstrap failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

