export async function sendOtpEmail(to: string, code: string) {
  const mode = (process.env.SMTP_MODE ?? "").toLowerCase();
  if (mode === "log") {
    console.log(`[OTP] to=${to} code=${code}`);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SMTP_FROM;

  if (!apiKey || !from) {
    throw new Error("Missing RESEND_API_KEY or SMTP_FROM environment variable");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Your verification code",
      text: `Your verification code is: ${code}\n\nThis code expires soon.`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}
