import { Address4, Address6 } from "ip-address";

function parseAddress(value: string) {
  if (value.includes("%")) return null;
  const host = value.split("/")[0] ?? "";
  if (
    !host.includes(":") &&
    host.split(".").some((part) => part.length > 1 && part.startsWith("0"))
  )
    return null;
  try {
    return value.includes(":") ? new Address6(value) : new Address4(value);
  } catch {
    return null;
  }
}

/**
 * Checks whether a client IP falls within any of the allowed CIDR ranges.
 * Pure function — no side effects.
 */
export function isIpAllowed(ip: string, allowedRanges: string[]): boolean {
  // No ranges configured — deny all (defensive: form validation prevents this)
  if (allowedRanges.length === 0) return false;
  const address = parseAddress(ip);
  if (!address || ip.includes("/")) return false;
  return allowedRanges.some((range) => {
    if (!range.includes("/")) return false;
    const subnet = parseAddress(range);
    return subnet?.constructor === address.constructor
      ? address.isInSubnet(subnet)
      : false;
  });
}
