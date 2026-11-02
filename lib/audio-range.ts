export interface AudioByteRange {
  start: number;
  end: number;
  length: number;
}
/** One RFC byte range only. Reject overflow, empty and multipart ranges before opening storage. */
export function audioByteRange(
  value: string,
  size: number,
): AudioByteRange | null {
  if (!Number.isSafeInteger(size) || size <= 0 || value.length > 128)
    return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const first = Number(match[1]),
    last = Number(match[2]);
  if (
    (match[1] && !Number.isSafeInteger(first)) ||
    (match[2] && !Number.isSafeInteger(last))
  )
    return null;
  if (!match[1] && last <= 0) return null;
  const start = match[1] ? first : Math.max(0, size - last);
  const end = !match[1] || !match[2] ? size - 1 : Math.min(size - 1, last);
  return start >= 0 && start < size && end >= start
    ? { start, end, length: end - start + 1 }
    : null;
}
