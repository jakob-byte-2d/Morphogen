import { describe, expect, it } from "vitest";
import { creatureName } from "../src/ui/card";
import { t } from "../src/ui/strings";

describe("creature names", () => {
  it("are the same for the same creature, and vary from one to the next", () => {
    expect(creatureName(17)).toBe(creatureName(17));
    expect(t.names).toContain(creatureName(17));
    const names = new Set(Array.from({ length: 40 }, (_, k) => creatureName(k + 1)));
    expect(names.size).toBeGreaterThan(25);
  });
});
