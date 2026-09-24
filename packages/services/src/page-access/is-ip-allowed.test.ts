import { expect } from "@std/expect";
import { describe, test } from "@std/testing/bdd";

import { isIpAllowed } from "./is-ip-allowed";

describe("isIpAllowed", () => {
  test("empty allowed ranges → denies all", () => {
    expect(isIpAllowed("1.2.3.4", [])).toBe(false);
  });

  test("IP inside single range → allowed", () => {
    expect(isIpAllowed("10.0.0.5", ["10.0.0.0/24"])).toBe(true);
  });

  test("IP outside single range → denied", () => {
    expect(isIpAllowed("10.0.1.5", ["10.0.0.0/24"])).toBe(false);
  });

  test("IP matches one of multiple ranges → allowed", () => {
    expect(isIpAllowed("192.168.1.10", ["10.0.0.0/24", "192.168.1.0/24"])).toBe(
      true,
    );
  });

  test("IP matches none of multiple ranges → denied", () => {
    expect(isIpAllowed("172.16.0.1", ["10.0.0.0/24", "192.168.1.0/24"])).toBe(
      false,
    );
  });

  test("exact /32 single-host range", () => {
    expect(isIpAllowed("1.2.3.4", ["1.2.3.4/32"])).toBe(true);
    expect(isIpAllowed("1.2.3.5", ["1.2.3.4/32"])).toBe(false);
  });

  test("malformed range is skipped, other ranges still evaluated", () => {
    expect(isIpAllowed("10.0.0.1", ["not-a-cidr", "10.0.0.0/24"])).toBe(true);
  });

  test("all malformed ranges → denied", () => {
    expect(isIpAllowed("10.0.0.1", ["not-a-cidr", "also-bad"])).toBe(false);
  });

  test("IPv6 range match", () => {
    expect(isIpAllowed("2001:db8::1", ["2001:db8::/32"])).toBe(true);
  });
});

describe("isIpAllowed fails closed", () => {
  test("IPv6 outside range and IPv4-mapped IPv6 are denied", () => {
    expect(isIpAllowed("2001:db9::7", ["2001:db8::/32"])).toBe(false);
    expect(isIpAllowed("::ffff:192.0.2.7", ["192.0.2.0/24"])).toBe(false);
  });

  test("ambiguous or malformed client input is denied", () => {
    expect(isIpAllowed("012.0.0.1", ["10.0.0.0/8"])).toBe(false);
    expect(isIpAllowed("192.0.2.7/24", ["192.0.2.0/24"])).toBe(false);
  });
});
