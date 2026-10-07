// The network PIN gates adding and changing branches. It lives only in the
// environment, so an unset NETWORK_PIN must refuse everything.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { networkPinOk } from "../src/lib/networkGate";

const env = process.env as Record<string, string | undefined>;
const saved = env.NETWORK_PIN;
let ip = 0;

/** Each request from its own address, so the limiter never decides a test. */
function req(headers: Record<string, string>, from = `10.0.0.${++ip}`): Request {
  return new Request("http://localhost/api/branches", { headers: { "x-forwarded-for": from, ...headers } });
}

// Each test starts two minutes after the last, so no limiter window carries over between tests.
let clock = Date.UTC(2026, 0, 1);
beforeEach(() => {
  vi.useFakeTimers();
  clock += 120_000;
  vi.setSystemTime(clock);
});

afterEach(() => {
  vi.useRealTimers();
  if (saved === undefined) delete env.NETWORK_PIN;
  else env.NETWORK_PIN = saved;
});

describe("networkPinOk", () => {
  it("refuses when NETWORK_PIN is unset, even with an empty header", () => {
    delete env.NETWORK_PIN;
    expect(networkPinOk(req({ "x-network-pin": "" }))).toBe(false);
    expect(networkPinOk(req({}))).toBe(false);
  });

  it("refuses when NETWORK_PIN is blank", () => {
    env.NETWORK_PIN = "";
    expect(networkPinOk(req({ "x-network-pin": "" }))).toBe(false);
  });

  it("accepts only the exact PIN", () => {
    env.NETWORK_PIN = "network-pin-7777";
    expect(networkPinOk(req({ "x-network-pin": "network-pin-7777" }))).toBe(true);
    expect(networkPinOk(req({ "x-network-pin": "777" }))).toBe(false);
    expect(networkPinOk(req({ "x-network-pin": "77777" }))).toBe(false);
    expect(networkPinOk(req({}))).toBe(false);
  });

  it("refuses even the right PIN after too many wrong ones from one address", () => {
    env.NETWORK_PIN = "network-pin-7777";
    const from = "10.9.9.9";
    for (let i = 0; i < 10; i++) expect(networkPinOk(req({ "x-network-pin": `000${i}` }, from))).toBe(false);
    expect(networkPinOk(req({ "x-network-pin": "network-pin-7777" }, from))).toBe(false);
    expect(networkPinOk(req({ "x-network-pin": "network-pin-7777" }))).toBe(true);
  });

  it("doesn't count right PINs against the limit", () => {
    env.NETWORK_PIN = "network-pin-7777";
    const from = "10.8.8.8";
    for (let i = 0; i < 15; i++) expect(networkPinOk(req({ "x-network-pin": "network-pin-7777" }, from))).toBe(true);
  });

  it("refuses even the right PIN once wrong PINs from many addresses pass the shared cap", () => {
    env.NETWORK_PIN = "network-pin-7777";
    for (let i = 0; i < 31; i++) expect(networkPinOk(req({ "x-network-pin": "0000" }, `10.7.${i}.1`))).toBe(false);
    expect(networkPinOk(req({ "x-network-pin": "network-pin-7777" }, "10.6.6.6"))).toBe(false);
    vi.setSystemTime(clock + 60_001);
    expect(networkPinOk(req({ "x-network-pin": "network-pin-7777" }, "10.6.6.6"))).toBe(true);
  });

  it("doesn't trip the shared cap below 30 wrong PINs", () => {
    env.NETWORK_PIN = "network-pin-7777";
    for (let i = 0; i < 29; i++) expect(networkPinOk(req({ "x-network-pin": "0000" }, `10.5.${i}.1`))).toBe(false);
    expect(networkPinOk(req({ "x-network-pin": "network-pin-7777" }, "10.4.4.4"))).toBe(true);
  });

  it("treats a NETWORK_PIN under 12 characters as unset", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    env.NETWORK_PIN = "7777";
    expect(networkPinOk(req({ "x-network-pin": "7777" }))).toBe(false);
    err.mockRestore();
  });
});
