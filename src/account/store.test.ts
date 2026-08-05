import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activatePlanLocally,
  hasWorkspaceAccess,
  loadAccount,
  loadUsage,
  recordExport,
  registerLocally,
  signInLocally,
  signOutLocally,
} from "./store";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("local accounts and plan access", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers and signs in without storing a plaintext password", async () => {
    const registered = await registerLocally(
      "maker@example.com",
      "StrongPassword2026!",
    );
    expect(registered.plan).toBe("unlicensed");
    expect(loadAccount()?.email).toBe("maker@example.com");
    expect(localStorage.getItem("airlab.accounts.v2")).not.toContain(
      "StrongPassword2026!",
    );

    signOutLocally();
    expect(loadAccount()).toBeNull();
    await expect(
      signInLocally("maker@example.com", "incorrect-password"),
    ).rejects.toThrow("Incorrect email or password");
    const signedIn = await signInLocally(
      "maker@example.com",
      "StrongPassword2026!",
    );
    expect(signedIn.id).toBe(registered.id);
  });

  it("activates plan access and keeps usage per account", async () => {
    const account = await registerLocally(
      "explorer@example.com",
      "AnotherStrongPassword!",
    );
    const activated = activatePlanLocally(
      account,
      "AIRLAB-EXPLORER-26-X7P9",
    );
    expect(activated.plan).toBe("explorer");
    expect(activated.expiresAt).not.toBeNull();
    expect(hasWorkspaceAccess(activated)).toBe(true);
    expect(() =>
      activatePlanLocally(activated, "AIRLAB-EXPLORER-26-X7P9"),
    ).toThrow("already been used");

    recordExport(activated.id);
    expect(loadUsage(activated.id).exports).toBe(1);
    expect(loadUsage("another-account").exports).toBe(0);
  });

  it("rejects an unknown activation code", async () => {
    const account = await registerLocally(
      "new@example.com",
      "YetAnotherPassword!",
    );
    expect(() => activatePlanLocally(account, "NOT-A-REAL-CODE")).toThrow(
      "not valid",
    );
  });
});
