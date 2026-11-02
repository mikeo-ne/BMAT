import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { guardedApi, authError, HttpError } from "@/lib/auth-core";
import { readBoundedJson } from "@/lib/integration-auth";
import {
  masterUploadTokenPolicy,
  recordMasterUploadReceipt,
} from "@/lib/cloud-masters";
import { privateBlobToken } from "@/lib/master-storage-config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const body = (await readBoundedJson(
      request,
      16 * 1024,
    )) as HandleUploadBody;
    if (
      !body ||
      !["blob.generate-client-token", "blob.upload-completed"].includes(
        body.type,
      )
    )
      throw new HttpError(422, "Invalid upload event.");
    if (body.type === "blob.upload-completed") {
      // Service callbacks have no browser cookie. SDK HMAC verification MUST run before any receipt is persisted.
      try {
        const result = await handleUpload({
          body,
          request,
          token: privateBlobToken(),
          onBeforeGenerateToken: async () => {
            throw new HttpError(403, "Not a browser upload request.");
          },
          onUploadCompleted: async ({ blob, tokenPayload }) =>
            recordMasterUploadReceipt(blob, tokenPayload),
        });
        return Response.json(result, {
          headers: { "cache-control": "no-store" },
        });
      } catch {
        throw new HttpError(403, "Upload callback verification failed.");
      }
    }
    return guardedApi(request, ["artist"], true, async (actor) => {
      const result = await handleUpload({
        body,
        request,
        token: privateBlobToken(),
        onBeforeGenerateToken: (pathname, payload, multipart) =>
          masterUploadTokenPolicy(actor, pathname, payload, multipart),
        onUploadCompleted: async ({ blob, tokenPayload }) =>
          recordMasterUploadReceipt(blob, tokenPayload),
      });
      return Response.json(result);
    });
  } catch (error) {
    return authError(error);
  }
}
