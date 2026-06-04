import { describe, expect, it } from "vitest";
import { normalizeOnlineAccountPassword } from "../accounts";

describe("online account validation", () => {
  it("requires account passwords to be text without control characters", () => {
    expect(normalizeOnlineAccountPassword("password")).toEqual({ ok: true, value: "password" });
    expect(normalizeOnlineAccountPassword("short")).toMatchObject({ ok: false });
    expect(normalizeOnlineAccountPassword("line\nbreak-password")).toMatchObject({ ok: false });
    expect(normalizeOnlineAccountPassword(123)).toMatchObject({ ok: false });
  });
});
