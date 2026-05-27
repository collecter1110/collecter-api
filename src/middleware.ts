import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: "/public/:path*",
};

const ALLOWED_METHODS = "GET, HEAD, OPTIONS";
const ALLOWED_HEADERS = "Content-Type";

function parseAllowedOrigins(): string[] {
  const raw = process.env.WEB_PUBLIC_ORIGIN ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = parseAllowedOrigins();
  const isAllowed = origin !== null && allowed.includes(origin);

  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": "86400",
  };
  if (isAllowed) {
    headers["Access-Control-Allow-Origin"] = origin!;
  }
  return headers;
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(corsHeaders(origin))) {
    res.headers.set(k, v);
  }
  return res;
}
