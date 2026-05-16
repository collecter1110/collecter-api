import { NextResponse } from "next/server";

export function apiResponse(data: Record<string, unknown> = {}, status = 200) {
  return NextResponse.json({ errorCode: "SU000", msg: "ok", data }, { status });
}

export function apiError(msg: string, status = 400, errorCode = "SU000") {
  return NextResponse.json({ errorCode, msg, data: {} }, { status });
}
