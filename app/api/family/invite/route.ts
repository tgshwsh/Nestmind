import { NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * POST /api/family/invite
 * 获取或生成当前用户家庭的邀请码
 */
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

    const admin = createSupabaseAdminClient();

    const { data: profile, error: profileErr } = await admin
      .from("users")
      .select("id, family_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr || !profile?.family_id) {
      return NextResponse.json(
        { error: "请先完成初始化（访问 /bootstrap）" },
        { status: 400 }
      );
    }

    const { data: family, error: familyErr } = await admin
      .from("families")
      .select("id, invite_code")
      .eq("id", profile.family_id)
      .single();

    if (familyErr || !family) {
      return NextResponse.json({ error: "family not found" }, { status: 404 });
    }

    let code = (family as { invite_code?: string }).invite_code;

    if (!code) {
      for (let attempt = 0; attempt < 5; attempt++) {
        code = generateCode();
        const { error: updateErr } = await admin
          .from("families")
          .update({ invite_code: code })
          .eq("id", family.id);

        if (!updateErr) break;
        if (attempt === 4) {
          return NextResponse.json(
            { error: "生成邀请码失败，请重试" },
            { status: 500 }
          );
        }
      }
    }

    const origin =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      "";
    const protocol = request.headers.get("x-forwarded-proto") || "https";
    const baseUrl = `${protocol}://${origin}`;
    const inviteUrl = `${baseUrl}/join?code=${encodeURIComponent(code!)}`;

    return NextResponse.json({
      ok: true,
      invite_code: code,
      invite_url: inviteUrl,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "invite failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
