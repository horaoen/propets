import { describe, expect, it } from "vitest";

import { buildEntriesQuery, isProtectedPath, normalizePage, parseTokens } from "../public/member-utils.js";

describe("member-utils", () => {
  it("buildEntriesQuery omits month when empty", () => {
    const query = buildEntriesQuery({ month: "", page: 1, pageSize: 10 });
    expect(query).toBe("page=1&pageSize=10");
  });

  it("buildEntriesQuery includes month when set", () => {
    const query = buildEntriesQuery({ month: "2026-02", page: 2, pageSize: 20 });
    expect(query).toBe("month=2026-02&page=2&pageSize=20");
  });

  it("isProtectedPath treats non-login as protected", () => {
    expect(isProtectedPath("/ledger")).toBe(true);
    expect(isProtectedPath("/login")).toBe(false);
  });

  it("normalizePage returns 1 for invalid values", () => {
    expect(normalizePage("0")).toBe(1);
    expect(normalizePage("abc")).toBe(1);
    expect(normalizePage("5")).toBe(5);
  });

  it("parseTokens validates payload shape", () => {
    const valid = parseTokens('{"accessToken":"a","refreshToken":"b"}');
    expect(valid).toEqual({ accessToken: "a", refreshToken: "b" });
    expect(parseTokens('{"accessToken":"a"}')).toBeNull();
    expect(parseTokens("bad-json")).toBeNull();
  });
});
