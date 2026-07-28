const ACCOUNT_KEY = "airlab.account.v1";
const USAGE_KEY = "airlab.usage.v1";

export interface AccountSession {
  name: string;
  email: string;
  plan: "Free";
  createdAt: string;
}

export interface UsageState {
  month: string;
  exports: number;
  generations: number;
}

const currentMonth = () => new Date().toISOString().slice(0, 7);

export const loadAccount = (): AccountSession | null => {
  try {
    const account = JSON.parse(
      localStorage.getItem(ACCOUNT_KEY) ?? "null",
    ) as AccountSession | null;
    return account &&
      typeof account.email === "string" &&
      typeof account.name === "string"
      ? account
      : null;
  } catch {
    return null;
  }
};

export const signInLocally = (
  name: string,
  email: string,
): AccountSession => {
  const account: AccountSession = {
    name: name.trim() || email.split("@")[0] || "AirLab user",
    email: email.trim(),
    plan: "Free",
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  return account;
};

export const signOutLocally = () => {
  localStorage.removeItem(ACCOUNT_KEY);
};

export const loadUsage = (): UsageState => {
  try {
    const stored = JSON.parse(
      localStorage.getItem(USAGE_KEY) ?? "null",
    ) as UsageState | null;
    if (stored?.month === currentMonth()) return stored;
  } catch {
    // A malformed counter is replaced below.
  }
  return { month: currentMonth(), exports: 0, generations: 0 };
};

const saveUsage = (usage: UsageState) => {
  localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  return usage;
};

export const recordExport = () => {
  const usage = loadUsage();
  return saveUsage({ ...usage, exports: usage.exports + 1 });
};

export const recordGeneration = () => {
  const usage = loadUsage();
  return saveUsage({ ...usage, generations: usage.generations + 1 });
};
