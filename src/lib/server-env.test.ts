import { afterEach, describe, expect, it } from "vitest";
import { ConfigurationError, getAppUrl, isAllowedOrigin } from "./server-env";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe("getAppUrl", () => {
  it("throws a configuration error when APP_URL is missing", () => {
    delete process.env["APP_URL"];
    delete process.env["PUBLIC_SITE_URL"];
    expect(() => getAppUrl()).toThrow(ConfigurationError);
  });

  it("never falls back to a preview URL", () => {
    delete process.env["APP_URL"];
    delete process.env["PUBLIC_SITE_URL"];
    try {
      getAppUrl();
    } catch (error) {
      expect(String(error)).not.toContain("lovable.app");
    }
  });

  it("returns the origin only", () => {
    process.env["APP_URL"] = "https://app.example.com/some/path?x=1";
    expect(getAppUrl()).toBe("https://app.example.com");
  });

  it("rejects non-https origins outside localhost", () => {
    process.env["APP_URL"] = "http://evil.example.com";
    expect(() => getAppUrl()).toThrow(ConfigurationError);
  });

  it("rejects malformed URLs", () => {
    process.env["APP_URL"] = "not-a-url";
    expect(() => getAppUrl()).toThrow(ConfigurationError);
  });
});

describe("isAllowedOrigin", () => {
  it("allows APP_URL and configured extras only", () => {
    process.env["APP_URL"] = "https://app.example.com";
    process.env["ALLOWED_ORIGINS"] = "https://staging.example.com";
    expect(isAllowedOrigin("https://app.example.com")).toBe(true);
    expect(isAllowedOrigin("https://staging.example.com")).toBe(true);
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
  });
});
