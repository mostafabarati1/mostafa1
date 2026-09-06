import { describe, expect, it } from "vitest";
import {
  buildCallbackUrl,
  buildResultUrl,
  isSettled,
  sanitizeAuthority,
  sanitizeRefId,
} from "./callback-utils";

describe("sanitizeAuthority", () => {
  it("accepts a normal ZarinPal authority", () => {
    expect(sanitizeAuthority("A00000000000000000000000000000123456")).toBe(
      "A00000000000000000000000000000123456",
    );
  });

  it("rejects empty, short and injected values", () => {
    expect(sanitizeAuthority(null)).toBeNull();
    expect(sanitizeAuthority("")).toBeNull();
    expect(sanitizeAuthority("abc")).toBeNull();
    expect(sanitizeAuthority("abcdef&status=success")).toBeNull();
    expect(sanitizeAuthority("../../etc/passwd")).toBeNull();
  });
});

describe("sanitizeRefId", () => {
  it("keeps safe characters only", () => {
    expect(sanitizeRefId("123456789")).toBe("123456789");
    expect(sanitizeRefId(987654321)).toBe("987654321");
    expect(sanitizeRefId("12<script>34")).toBe("12script34");
    expect(sanitizeRefId("")).toBeNull();
    expect(sanitizeRefId(undefined)).toBeNull();
  });
});

describe("buildResultUrl", () => {
  it("always targets the real result route on the allowed origin", () => {
    expect(buildResultUrl("https://app.example.com", "success", "123")).toBe(
      "https://app.example.com/payment-result?status=success&ref=123",
    );
  });

  it("never escapes the configured origin", () => {
    const url = new URL(buildResultUrl("https://app.example.com", "pending"));
    expect(url.origin).toBe("https://app.example.com");
    expect(url.searchParams.get("ref")).toBeNull();
  });
});

describe("buildCallbackUrl", () => {
  it("defaults to the real callback route", () => {
    expect(buildCallbackUrl("https://app.example.com", null)).toBe(
      "https://app.example.com/payment/callback",
    );
  });

  it("normalises a missing leading slash", () => {
    expect(buildCallbackUrl("https://app.example.com", "payment/callback")).toBe(
      "https://app.example.com/payment/callback",
    );
  });
});

describe("isSettled", () => {
  it("treats settled statuses as final", () => {
    expect(isSettled("paid")).toBe(true);
    expect(isSettled("verified")).toBe(true);
    expect(isSettled("completed")).toBe(true);
    expect(isSettled("processing")).toBe(false);
    expect(isSettled("failed")).toBe(false);
    expect(isSettled(null)).toBe(false);
  });
});
