import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { postgresStorageEnabled } from "@/lib/postgres/pool";
async function key(): Promise<Buffer> {
  const configured = process.env.EAST_SOUND_SECRET_KEY;
  if (configured) {
    const bytes = Buffer.from(
      configured,
      /^[a-f0-9]{64}$/i.test(configured) ? "hex" : "base64",
    );
    if (bytes.length !== 32)
      throw new Error("EAST_SOUND_SECRET_KEY must encode 32 random bytes.");
    return bytes;
  }
  if (postgresStorageEnabled() || process.env.VERCEL === "1")
    throw new Error(
      "Configure EAST_SOUND_SECRET_KEY for encrypted notification credentials.",
    );
  const directory = path.join(
      process.env.EAST_SOUND_DATA_DIR ?? path.join(process.cwd(), ".data"),
      "security",
    ),
    filename = path.join(directory, "notification.key");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    const bytes = await readFile(filename);
    if (bytes.length !== 32)
      throw new Error("Invalid notification key; no reset was performed.");
    return bytes;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    await writeFile(filename, randomBytes(32), { mode: 0o600, flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const bytes = await readFile(filename);
  if (bytes.length !== 32) throw new Error("Invalid notification key.");
  return bytes;
}
export async function sealSecret(value: string): Promise<string> {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", await key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    ciphertext.toString("hex"),
  ].join(".");
}
export async function openSecret(value: string): Promise<string> {
  const [version, iv, tag, ciphertext] = value.split(".");
  if (
    version !== "v1" ||
    !/^[a-f0-9]{24}$/.test(iv) ||
    !/^[a-f0-9]{32}$/.test(tag) ||
    !/^(?:[a-f0-9]{2})+$/.test(ciphertext)
  )
    throw new Error("Invalid encrypted credential.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    await key(),
    Buffer.from(iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
