import { isAllowedOwner } from "./owner";

export function isAllowedGitHubOwner(id: unknown): id is number {
  const configuredId = process.env.OWNER_GITHUB_ID?.trim();
  return (
    typeof id === "number" &&
    Number.isSafeInteger(id) &&
    id > 0 &&
    configuredId === String(id)
  );
}

export function isGitHubLoginConfigured(): boolean {
  const configuredId = process.env.OWNER_GITHUB_ID?.trim();
  return Boolean(
    process.env.AUTH_GITHUB_ID?.trim() &&
    process.env.AUTH_GITHUB_SECRET?.trim() &&
    configuredId &&
    isAllowedGitHubOwner(Number(configuredId)) &&
    isAllowedOwner(process.env.OWNER_EMAIL),
  );
}

export function mapGitHubOwnerProfile(profile: Record<string, unknown>) {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (
    !isGitHubLoginConfigured() ||
    !isAllowedGitHubOwner(profile.id) ||
    !email
  ) {
    throw new Error("GitHub access denied");
  }
  return {
    id: String(profile.id),
    email,
    tenantId: null,
    firstName: null,
    lastName: null,
    photoUrl:
      typeof profile.avatar_url === "string" ? profile.avatar_url : null,
    emailVerified: null,
    createdAt: null,
    updatedAt: null,
    deletedAt: null,
    name:
      typeof profile.name === "string" && profile.name.trim()
        ? profile.name.trim()
        : typeof profile.login === "string" && profile.login.trim()
          ? profile.login.trim()
          : "Owner",
    image: typeof profile.avatar_url === "string" ? profile.avatar_url : null,
  };
}

export async function fetchGitHubOwnerProfile(
  accessToken: unknown,
): Promise<Record<string, unknown>> {
  if (
    !isGitHubLoginConfigured() ||
    typeof accessToken !== "string" ||
    !accessToken
  ) {
    throw new Error("GitHub access denied");
  }
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "oeffigo-status",
    },
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("GitHub access denied");
  const profile: unknown = await response.json();
  if (
    !profile ||
    typeof profile !== "object" ||
    Array.isArray(profile) ||
    !("id" in profile) ||
    !isAllowedGitHubOwner(profile.id)
  ) {
    throw new Error("GitHub access denied");
  }
  return { ...profile };
}
