/** Keep untrusted metadata inert when a logging sheet is opened in Excel. */
export function csvCell(value: string | number | null | undefined): string {
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "";
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRows(
  rows: (string | number | null | undefined)[][],
): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function downloadCsv(fileName: string, csv: string): void {
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Let the browser consume the URL before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
