/**
 * The alert sender is a public URL that spends money (WhatsApp messages are
 * billed), so it only answers a caller that knows the shared secret.
 *
 * Vercel cron sends `Authorization: Bearer $CRON_SECRET`; the GitHub Action
 * sends the same header. `x-cron-secret` exists for quick manual curls.
 */
export function secretMatches(req: Request, secret: string): boolean {
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  return bearer === secret || (req.headers.get("x-cron-secret") ?? "") === secret;
}
