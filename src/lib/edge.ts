// Edge Function 프록시 헬퍼
export async function callEdgeFunction(
  functionName: string,
  accessToken: string,
  body?: unknown
): Promise<Response> {
  const supabaseUrl = process.env.SUPABASE_URL!;
  return fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
