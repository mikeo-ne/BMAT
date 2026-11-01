import { guardedApi } from "@/lib/auth-core";
import { readSecurityAudit } from "@/lib/security-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return guardedApi(request, ["cmo"], false, async () =>
    Response.json({
      entries: await readSecurityAudit(),
      notice:
        "Append-only application attestations. Account authentication does not certify legal identity, rights ownership or UPRS membership.",
    }),
  );
}
