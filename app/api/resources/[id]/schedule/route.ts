import { type NextRequest, NextResponse } from "next/server";

import { executeResourceSchedulePlan } from "@/lib/server/resource-schedule-plan";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/resources/:id/schedule
 * Body: { start_date, end_date, weekdays, start_time_slot?, end_time_slot? }
 */
export async function POST(request: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      start_date?: string;
      end_date?: string;
      weekdays?: number[];
      start_time_slot?: string;
      end_time_slot?: string;
    };

    return executeResourceSchedulePlan(request.headers, id, {
      start_date: body.start_date ?? "",
      end_date: body.end_date ?? "",
      weekdays: body.weekdays ?? [],
      start_time_slot: body.start_time_slot,
      end_time_slot: body.end_time_slot,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "invalid json";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
