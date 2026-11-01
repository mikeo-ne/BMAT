/** Shared client/server validation. Server dispatch also resolves DNS before making a request. */
export function publicHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      url.hash
    )
      return null;
    if (
      !host.includes(".") ||
      /^[\d.]+$/.test(host) ||
      host.includes(":") ||
      host.startsWith("[")
    )
      return null;
    if (
      [
        "localhost",
        "local",
        "internal",
        "test",
        "invalid",
        "example",
        "onion",
      ].some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
    )
      return null;
    if (host.endsWith(".localhost") || value.length > 2048) return null;
    return url;
  } catch {
    return null;
  }
}
