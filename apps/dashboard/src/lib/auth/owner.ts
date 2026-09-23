export function isAllowedOwner(email: string | null | undefined): boolean {
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  return Boolean(
    owner &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner) &&
    email?.trim().toLowerCase() === owner,
  );
}
