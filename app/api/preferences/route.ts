import { guardedApi } from "@/lib/auth-core";
import { readBoundedJson } from "@/lib/integration-auth";
import {
  accountPreferences,
  saveAccountPreferences,
} from "@/lib/account-notifications";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return guardedApi(request, ["artist"], false, async (actor) =>
    Response.json({ config: await accountPreferences(actor.id) }),
  );
}
export async function PUT(request: Request) {
  return guardedApi(request, ["artist"], true, async (actor) =>
    Response.json({
      config: await saveAccountPreferences(
        actor,
        await readBoundedJson(request, 131072),
      ),
    }),
  );
}
