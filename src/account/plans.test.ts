import { describe, expect, it } from "vitest";
import { planUsageLimit } from "./plans";

describe("plan usage limits", () => {
  it("keeps the finite Explorer and Maker limits", () => {
    expect(planUsageLimit("explorer", "exports")).toBe(10);
    expect(planUsageLimit("explorer", "projects")).toBe(1);
    expect(planUsageLimit("maker", "exports")).toBe(100);
    expect(planUsageLimit("maker", "projects")).toBe(15);
  });

  it("preserves Merchant unlimited access", () => {
    expect(planUsageLimit("merchant", "exports")).toBeNull();
    expect(planUsageLimit("merchant", "projects")).toBeNull();
  });

  it("does not grant limits without an active plan", () => {
    expect(planUsageLimit("unlicensed", "exports")).toBe(0);
    expect(planUsageLimit(undefined, "projects")).toBe(0);
  });

  it("keeps administrator access unlimited", () => {
    expect(planUsageLimit("explorer", "exports", true)).toBeNull();
    expect(planUsageLimit("unlicensed", "projects", true)).toBeNull();
  });
});
