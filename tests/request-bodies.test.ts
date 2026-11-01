import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readBoundedFormData, readBoundedJson } from "@/lib/integration-auth";
import { MAX_UPLOAD_BYTES } from "@/lib/upload";

const endpoint = "https://app.example.com/api/tracks";
function streamed(body: ReadableStream<Uint8Array>, headers: HeadersInit) {
  return new Request(endpoint, {
    method: "POST",
    headers,
    body,
    duplex: "half",
  } as RequestInit);
}
function endless(chunk: Uint8Array, failCancel = false) {
  let pulled = 0,
    cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled++;
      controller.enqueue(chunk);
    },
    cancel() {
      cancelled = true;
      if (failCancel) throw new Error("Disconnected upstream");
    },
  });
  return { body, pulled: () => pulled, cancelled: () => cancelled };
}

describe("bounded authenticated request parsing", () => {
  it("preserves multipart audio bytes and metadata at the exact request boundary", async () => {
    const form = new FormData();
    form.set("title", "A real multipart title");
    form.set(
      "audio",
      new File(
        [new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69])],
        "master.wav",
        { type: "audio/wav" },
      ),
    );
    const source = new Request(endpoint, { method: "POST", body: form });
    const bytes = new Uint8Array(await source.arrayBuffer());
    const input = streamed(
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.subarray(0, 40));
          controller.enqueue(bytes.subarray(40));
          controller.close();
        },
      }),
      source.headers,
    );
    const parsed = await readBoundedFormData(input, bytes.byteLength);
    expect(parsed.get("title")).toBe("A real multipart title");
    const file = parsed.get("audio") as File;
    expect(file.name).toBe("master.wav");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(
      new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]),
    );
    expect(input.body!.locked).toBe(false);
  });
  it("rejects a declared oversize body before acquiring a reader", async () => {
    const request = new Request(endpoint, {
      method: "POST",
      body: "short",
      headers: {
        "content-type": "multipart/form-data; boundary=qa",
        "content-length": String(MAX_UPLOAD_BYTES + 1024 * 1024 + 1),
      },
    });
    const reader = vi.spyOn(request.body!, "getReader");
    await expect(
      readBoundedFormData(request, MAX_UPLOAD_BYTES + 1024 * 1024),
    ).rejects.toMatchObject({ status: 413 });
    expect(reader).not.toHaveBeenCalled();
  });
  it.each([undefined, "2"])(
    "cancels an actual 81 MiB overflow even when Content-Length is %s",
    async (length) => {
      const source = endless(new Uint8Array(1024 * 1024));
      const headers = new Headers({
        "content-type": "multipart/form-data; boundary=qa",
      });
      if (length !== undefined) headers.set("content-length", length);
      const request = streamed(source.body, headers);
      await expect(
        readBoundedFormData(request, MAX_UPLOAD_BYTES + 1024 * 1024),
      ).rejects.toMatchObject({ status: 413 });
      expect(source.cancelled()).toBe(true);
      expect(source.pulled()).toBeLessThanOrEqual(83);
      expect(request.body!.locked).toBe(false);
    },
  );
  it("preserves the 413 result even if cancellation itself fails", async () => {
    const source = endless(new Uint8Array(64), true);
    const request = streamed(source.body, {
      "content-type": "multipart/form-data; boundary=qa",
    });
    await expect(readBoundedFormData(request, 128)).rejects.toMatchObject({
      status: 413,
    });
    expect(source.cancelled()).toBe(true);
    expect(request.body!.locked).toBe(false);
  });
  it("returns 400 for truncated/malformed multipart and releases the reader", async () => {
    const request = new Request(endpoint, {
      method: "POST",
      body: '--qa\r\nContent-Disposition: form-data; name="audio"\r\n',
      headers: { "content-type": "multipart/form-data; boundary=qa" },
    });
    await expect(readBoundedFormData(request, 1024)).rejects.toMatchObject({
      status: 400,
    });
    expect(request.body!.locked).toBe(false);
  });
  it("treats an interrupted source as a bounded 400, not an uncaught server error", async () => {
    const request = streamed(
      new ReadableStream({
        pull(controller) {
          controller.error(new Error("Disconnected client"));
        },
      }),
      { "content-type": "multipart/form-data; boundary=qa" },
    );
    await expect(readBoundedFormData(request, 1024)).rejects.toMatchObject({
      status: 400,
    });
    expect(request.body!.locked).toBe(false);
  });
  it.each(["application/json", "application/octet-stream"])(
    "rejects %s instead of parsing it as audio",
    async (type) => {
      await expect(
        readBoundedFormData(
          new Request(endpoint, {
            method: "POST",
            body: "{}",
            headers: { "content-type": type },
          }),
          1024,
        ),
      ).rejects.toMatchObject({ status: 415 });
    },
  );
  it("rejects a bodyless multipart request", async () => {
    await expect(
      readBoundedFormData(
        new Request(endpoint, {
          method: "POST",
          headers: { "content-type": "multipart/form-data; boundary=qa" },
        }),
        1024,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("also caps chunked JSON and cancels it despite misleading length/cancellation failure", async () => {
    const source = endless(new Uint8Array(64), true);
    const request = streamed(source.body, {
      "content-type": "application/json",
      "content-length": "2",
    });
    await expect(readBoundedJson(request, 128)).rejects.toMatchObject({
      status: 413,
    });
    expect(source.cancelled()).toBe(true);
    expect(request.body!.locked).toBe(false);
  });
  it("accepts exact-budget JSON and distinguishes malformed JSON", async () => {
    const json = '{"valid":true}';
    expect(
      await readBoundedJson(
        new Request(endpoint, {
          method: "POST",
          body: json,
          headers: { "content-type": "application/json; charset=utf-8" },
        }),
        Buffer.byteLength(json),
      ),
    ).toEqual({ valid: true });
    await expect(
      readBoundedJson(
        new Request(endpoint, {
          method: "POST",
          body: "{broken",
          headers: { "content-type": "application/json" },
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
