import {
  planById,
  planRank,
  type AccountPlan,
  type PlanId,
} from "./plans";

const ACCOUNTS_KEY = "airlab.accounts.v2";
const SESSION_KEY = "airlab.session.v2";
const USAGE_KEY_PREFIX = "airlab.usage.v2";
const PASSWORD_ITERATIONS = 180_000;

const ADMIN_EMAIL = "admin@airlab.local";
const ADMIN_PASSWORD_HASH =
  "d170e16e5348ba315ae8ebc5b05dfea0374889e978cdda25581f7ddb0a69771f";

export const PLAN_ACCESS_CODES: Record<PlanId, string> = {
  explorer: "AIRLAB-EXPLORER-26-X7P9",
  maker: "AIRLAB-MAKER-26-B4N8",
  merchant: "AIRLAB-MERCHANT-26-Q2W6",
};

export interface AccountSession {
  id: string;
  name: string;
  email: string;
  plan: AccountPlan;
  createdAt: string;
  activatedAt: string | null;
  expiresAt: string | null;
  isAdmin: boolean;
}

interface StoredAccount extends AccountSession {
  passwordSalt: string;
  passwordHash: string;
  redeemedPlans: PlanId[];
}

export interface UsageState {
  month: string;
  exports: number;
  generations: number;
}

const currentMonth = () => new Date().toISOString().slice(0, 7);
const normalizeEmail = (email: string) => email.trim().toLowerCase();
const createId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `account-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const bytesToBase64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes));

const base64ToBytes = (value: string) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

const bytesToHex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

const sha256 = async (value: string) =>
  bytesToHex(
    await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    ),
  );

const hashPassword = async (password: string, salt: Uint8Array) => {
  const saltBuffer = Uint8Array.from(salt).buffer;
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: PASSWORD_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return bytesToHex(bits);
};

const loadAccounts = (): StoredAccount[] => {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(ACCOUNTS_KEY) ?? "[]",
    ) as StoredAccount[];
    return Array.isArray(parsed)
      ? parsed.filter(
          (account) =>
            typeof account?.id === "string" &&
            typeof account?.email === "string" &&
            typeof account?.passwordHash === "string" &&
            typeof account?.passwordSalt === "string",
        )
      : [];
  } catch {
    return [];
  }
};

const saveAccounts = (accounts: StoredAccount[]) => {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
};

const publicAccount = ({
  passwordHash: _passwordHash,
  passwordSalt: _passwordSalt,
  ...account
}: StoredAccount): AccountSession => account;

const saveSession = (account: AccountSession) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(account));
  return account;
};

export const loadAccount = (): AccountSession | null => {
  try {
    const session = JSON.parse(
      localStorage.getItem(SESSION_KEY) ?? "null",
    ) as AccountSession | null;
    if (
      !session ||
      typeof session.id !== "string" ||
      typeof session.email !== "string"
    ) {
      return null;
    }
    if (session.isAdmin && session.email === ADMIN_EMAIL) return session;
    const stored = loadAccounts().find(
      (account) => account.id === session.id,
    );
    return stored ? publicAccount(stored) : null;
  } catch {
    return null;
  }
};

export const registerLocally = async (
  email: string,
  password: string,
): Promise<AccountSession> => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail.includes("@")) {
    throw new Error("Enter a valid email address.");
  }
  if (password.length < 8) {
    throw new Error("Password must contain at least 8 characters.");
  }
  if (normalizedEmail === ADMIN_EMAIL) {
    throw new Error("This email address is reserved.");
  }
  const accounts = loadAccounts();
  if (accounts.some((account) => account.email === normalizedEmail)) {
    throw new Error("An account with this email already exists.");
  }

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const now = new Date().toISOString();
  const stored: StoredAccount = {
    id: createId(),
    name: normalizedEmail.split("@")[0] || "AirLab user",
    email: normalizedEmail,
    plan: "unlicensed",
    createdAt: now,
    activatedAt: null,
    expiresAt: null,
    isAdmin: false,
    passwordSalt: bytesToBase64(salt),
    passwordHash: await hashPassword(password, salt),
    redeemedPlans: [],
  };
  saveAccounts([...accounts, stored]);
  return saveSession(publicAccount(stored));
};

export const signInLocally = async (
  email: string,
  password: string,
): Promise<AccountSession> => {
  const normalizedEmail = normalizeEmail(email);
  if (
    normalizedEmail === ADMIN_EMAIL &&
    (await sha256(password)) === ADMIN_PASSWORD_HASH
  ) {
    return saveSession({
      id: "airlab-admin",
      name: "AirLab Admin",
      email: ADMIN_EMAIL,
      plan: "merchant",
      createdAt: "2026-07-30T00:00:00.000Z",
      activatedAt: "2026-07-30T00:00:00.000Z",
      expiresAt: null,
      isAdmin: true,
    });
  }

  const stored = loadAccounts().find(
    (account) => account.email === normalizedEmail,
  );
  if (
    !stored ||
    (await hashPassword(
      password,
      base64ToBytes(stored.passwordSalt),
    )) !== stored.passwordHash
  ) {
    throw new Error("Incorrect email or password.");
  }
  return saveSession(publicAccount(stored));
};

export const signOutLocally = () => {
  localStorage.removeItem(SESSION_KEY);
};

export const hasWorkspaceAccess = (account: AccountSession | null) => {
  if (!account) return false;
  if (account.isAdmin) return true;
  if (account.plan === "unlicensed") return false;
  return !account.expiresAt || new Date(account.expiresAt).getTime() > Date.now();
};

const normalizedCode = (code: string) =>
  code.trim().toUpperCase().replace(/\s+/g, "");

export const activatePlanLocally = (
  account: AccountSession,
  code: string,
): AccountSession => {
  if (account.isAdmin) return account;
  const entry = Object.entries(PLAN_ACCESS_CODES).find(
    ([, accessCode]) => normalizedCode(accessCode) === normalizedCode(code),
  ) as [PlanId, string] | undefined;
  if (!entry) throw new Error("This activation code is not valid.");

  const definition = planById(entry[0]);
  if (!definition) throw new Error("The selected plan is unavailable.");
  if (
    account.plan !== "unlicensed" &&
    planRank(definition.id) < planRank(account.plan)
  ) {
    throw new Error("A lower tier cannot replace your current plan.");
  }
  const activatedAt = new Date();
  const expiresAt =
    definition.durationDays === null
      ? null
      : new Date(
          activatedAt.getTime() +
            definition.durationDays * 24 * 60 * 60 * 1_000,
        ).toISOString();
  const updated: AccountSession = {
    ...account,
    plan: definition.id,
    activatedAt: activatedAt.toISOString(),
    expiresAt,
  };
  const accounts = loadAccounts();
  const stored = accounts.find((candidate) => candidate.id === account.id);
  if (!stored) throw new Error("The local account could not be updated.");
  if ((stored.redeemedPlans ?? []).includes(definition.id)) {
    throw new Error("This plan code has already been used by this account.");
  }
  saveAccounts(
    accounts.map((candidate) =>
      candidate.id === account.id
        ? {
            ...candidate,
            ...updated,
            redeemedPlans: [
              ...(candidate.redeemedPlans ?? []),
              definition.id,
            ],
          }
        : candidate,
    ),
  );
  return saveSession(updated);
};

const usageKey = (accountId: string) => `${USAGE_KEY_PREFIX}:${accountId}`;

export const loadUsage = (accountId?: string | null): UsageState => {
  if (!accountId) {
    return { month: currentMonth(), exports: 0, generations: 0 };
  }
  try {
    const stored = JSON.parse(
      localStorage.getItem(usageKey(accountId)) ?? "null",
    ) as UsageState | null;
    if (stored?.month === currentMonth()) return stored;
  } catch {
    // A malformed counter is replaced below.
  }
  return { month: currentMonth(), exports: 0, generations: 0 };
};

const saveUsage = (accountId: string, usage: UsageState) => {
  localStorage.setItem(usageKey(accountId), JSON.stringify(usage));
  return usage;
};

export const recordExport = (accountId: string) => {
  const usage = loadUsage(accountId);
  return saveUsage(accountId, { ...usage, exports: usage.exports + 1 });
};

export const recordGeneration = (accountId: string) => {
  const usage = loadUsage(accountId);
  return saveUsage(accountId, {
    ...usage,
    generations: usage.generations + 1,
  });
};
