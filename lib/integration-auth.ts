import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export function integrationAuth(
  request: Request,
  environmentKey: string,
): Response | null {
  const expected = process.env[environmentKey];
  if (!expected || expected.length < 32)
    return Response.json(
      {
        error:
          "Integration disabled. Configure a server-side integration token of at least 32 characters.",
      },
      { status: 503 },
    );
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (
    !supplied ||
    supplied.length > 4096 ||
    !timingSafeEqual(digest(supplied), digest(expected))
  )
    return Response.json(
      { error: "Invalid integration credentials." },
      { status: 401 },
    );
  return null;
}

export class RequestBodyError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function readBoundedJson(
  request: Request,
  limit = 64 * 1024,
): Promise<unknown> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .split(";")[0]
      .trim()
      .match(/^application\/json$/)
  )
    throw new RequestBodyError("Use application/json.", 415);
  if (Number(request.headers.get("content-length")) > limit)
    throw new RequestBodyError("Request body too large.", 413);
  const reader = request.body?.getReader();
  if (!reader)
    throw new RequestBodyError("A JSON request body is required.", 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyError("Request body too large.", 413);
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError("Malformed JSON body.", 400);
  } finally {
    reader.releaseLock();
  }
}

/** Bound streamed uploads without making additional full-size application buffers. */
export async function readBoundedFormData(
  request: Request,
  limit: number,
): Promise<FormData> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data;"))
    throw new RequestBodyError(
      "Use multipart/form-data with an audio master.",
      415,
    );
  if (Number(request.headers.get("content-length")) > limit)
    throw new RequestBodyError("Request exceeds the 80 MB audio budget.", 413);
  const reader = request.body?.getReader();
  if (!reader)
    throw new RequestBodyError("An audio request body is required.", 400);
  let size = 0;
  const bounded = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          size += value.byteLength;
          if (size > limit) {
            controller.error(
              new RequestBodyError(
                "Request exceeds the 80 MB audio budget.",
                413,
              ),
            );
            await reader.cancel().catch(() => undefined);
            return;
          }
          controller.enqueue(value);
        } catch {
          controller.error(
            new RequestBodyError("Incomplete multipart audio request.", 400),
          );
        }
      },
      async cancel(reason) {
        await reader.cancel(reason).catch(() => undefined);
      },
    },
    { highWaterMark: 0 },
  );
  try {
    return await new Response(bounded, {
      headers: { "content-type": contentType },
    }).formData();
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError("Malformed multipart audio request.", 400);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
