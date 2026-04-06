import nodemailer from "nodemailer";

export async function sendOtpEmail(to: string, code: string) {
  const mode = (process.env.SMTP_MODE ?? "").toLowerCase();
  if (mode === "log") {
    console.log(`[OTP] to=${to} code=${code}`);
    return;
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !user || !pass || !from) {
    throw new Error("Missing SMTP_* environment variables");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const subject = "Your verification code";
  const text = `Your verification code is: ${code}\n\nThis code expires soon.`;

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
  });
}

