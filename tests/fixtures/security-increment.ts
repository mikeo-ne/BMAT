import { mutateAccountDocument } from "@/lib/security-store";
const owner = process.argv[2];
if (
  !owner ||
  !process.env.EAST_SOUND_DATA_DIR ||
  process.env.EAST_SOUND_STORAGE_BACKEND !== "file"
)
  throw new Error("Isolated file-store test only.");
async function main() {
  for (let i = 0; i < 20; i++)
    await mutateAccountDocument<number>(
      owner,
      "test-counter",
      "shared",
      (value) => (value ?? 0) + 1,
    );
}
main().catch(() => {
  console.error("Isolated increment failed.");
  process.exitCode = 1;
});
