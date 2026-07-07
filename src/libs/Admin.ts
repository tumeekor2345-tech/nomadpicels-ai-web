import { clerkClient } from '@clerk/nextjs/server';
import { Env } from './Env';

// There's no per-platform "admin" role in this app (the `org:admin` role in
// src/types/Auth.ts is unrelated — it's a per-customer team permission, not
// an operator role for NomadPixels AI itself). Access to /dashboard/admin is
// controlled by a plain email allowlist instead: ADMIN_EMAILS env var (comma
// separated) plus a hardcoded fallback so the page works even before that
// env var is set on Vercel.
const FALLBACK_ADMIN_EMAILS = ['tumee.kor2345@gmail.com'];

function getAdminEmails(): string[] {
  const fromEnv = Env.ADMIN_EMAILS
    ? Env.ADMIN_EMAILS.split(',').map(email => email.trim().toLowerCase()).filter(Boolean)
    : [];

  return [...new Set([...FALLBACK_ADMIN_EMAILS.map(e => e.toLowerCase()), ...fromEnv])];
}

export async function isAdminUser(userId: string | null | undefined): Promise<boolean> {
  if (!userId) {
    return false;
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const adminEmails = getAdminEmails();

  return user.emailAddresses.some(email => adminEmails.includes(email.emailAddress.toLowerCase()));
}
