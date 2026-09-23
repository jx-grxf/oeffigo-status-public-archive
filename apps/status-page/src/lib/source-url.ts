export function sourceUrl(
  repo: string | undefined,
  revision: string | undefined,
) {
  if (!/^[a-f0-9]{40}$/.test(revision ?? "")) return null;
  try {
    const url = new URL(repo ?? "");
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      !/^\/[a-z0-9-]+\/[a-z0-9-]+$/i.test(url.pathname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return `${url.origin}${url.pathname}/tree/source-${revision}`;
  } catch {
    return null;
  }
}
