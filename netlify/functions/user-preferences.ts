import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

type UserPreferences = {
  showContainerModules: boolean;
};

const DEFAULT_ACCOUNT_KEY = "rodahmar-shipping";
const DEFAULT_USER_PREFERENCES: UserPreferences = {
  showContainerModules: false,
};
const USER_PREFERENCES_STORE = "user-preferences";

function normalizePreferences(value: unknown): UserPreferences {
  const body = value && typeof value === "object" ? (value as Partial<UserPreferences>) : {};
  return {
    showContainerModules: Boolean(body.showContainerModules),
  };
}

function getAccountKey(req: Request, body?: Record<string, unknown>) {
  const requestedAccount = String(body?.accountKey || req.headers.get("x-seacharter-account") || DEFAULT_ACCOUNT_KEY).trim();
  return requestedAccount || DEFAULT_ACCOUNT_KEY;
}

export default async (req: Request) => {
  try {
    const store = getStore({ name: USER_PREFERENCES_STORE, consistency: "strong" });

    if (req.method === "GET") {
      const accountKey = getAccountKey(req);
      const storedPreferences = await store.get(accountKey, { type: "json" });
      const preferences = normalizePreferences(storedPreferences);
      return Response.json({
        success: true,
        preferences: {
          showContainerModules: preferences.showContainerModules,
        },
      });
    }

    if (req.method === "PUT" || req.method === "PATCH" || req.method === "POST") {
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      const accountKey = getAccountKey(req, body);
      const preferences = normalizePreferences(body?.preferences || body);
      await store.setJSON(accountKey, preferences);
      return Response.json({
        success: true,
        preferences,
      });
    }

    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    console.error("[user-preferences] Request failed.", error);
    return Response.json({ success: false, error: "User preferences request failed" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/user-preferences",
};
