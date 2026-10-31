import { NextResponse } from "next/server";
import { appVersion } from "@/server/config/env";
import { gateFromRequest } from "@/server/security/token";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const gate = gateFromRequest(req);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status });
  }
  return NextResponse.json({
    ok: true,
    version: appVersion(),
    pid: process.pid,
  });
}
