import { NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Body = {
  resource_id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  weekdays: number[]; // 0=Sun, 1=Mon, ... 6=Sat
  start_time_slot?: string; // "09:00"
  end_time_slot?: string; // "09:30"
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

    const body = (await request.json()) as Body;
    const resourceId = body.resource_id?.trim();
    if (!resourceId) {
      return NextResponse.json({ error: "missing resource_id" }, { status: 400 });
    }

    const { data: resource, error: resErr } = await admin
      .from("resources")
      .select("id, title, family_id")
      .eq("id", resourceId)
      .single();
    if (resErr || !resource) {
      return NextResponse.json({ error: "resource not found" }, { status: 404 });
    }

    const familyId = resource.family_id as string;
    if (!familyId) return NextResponse.json({ error: "resource has no family" }, { status: 400 });

    const startDate = body.start_date?.trim();
    const endDate = body.end_date?.trim();
    const weekdays = Array.isArray(body.weekdays) ? body.weekdays : [];
    const startSlot = body.start_time_slot?.trim() || "09:00";
    const endSlot = body.end_time_slot?.trim() || "09:30";

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "start_date and end_date required" }, { status: 400 });
    }

    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T23:59:59");
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return NextResponse.json({ error: "invalid date range" }, { status: 400 });
    }

    const weekdaysSet = new Set(weekdays);
    const toInsert: {
      family_id: string;
      title: string;
      start_time: string;
      end_time: string;
      is_recurring: boolean;
      created_by: string;
      resource_id: string;
    }[] = [];
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= end) {
      const dayOfWeek = cursor.getDay();
      if (weekdaysSet.has(dayOfWeek)) {
        const y = cursor.getFullYear();
        const m = String(cursor.getMonth() + 1).padStart(2, "0");
        const d = String(cursor.getDate()).padStart(2, "0");
        const dateStr = `${y}-${m}-${d}`;
        toInsert.push({
          family_id: familyId,
          title: resource.title as string,
          start_time: `${dateStr}T${startSlot}:00`,
          end_time: `${dateStr}T${endSlot}:00`,
          is_recurring: false,
          created_by: user.id,
          resource_id: resourceId,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (toInsert.length === 0) {
      return NextResponse.json({ ok: true, count: 0, message: "no matching weekdays in range" });
    }

    const { error: insertErr } = await admin.from("schedules").insert(toInsert);
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, count: toInsert.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "schedule create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

