#!/usr/bin/env node
/*
  SY-EGTP Auth migration utility
  - Reads users from public.sytpt_users
  - Ensures each user has a Supabase Auth account using app-compatible alias email
  - Writes login_id/name/role to user_metadata

  Required env:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY

  Optional env:
  - MIGRATION_USER_FILTER_ROLE=player|coach (default: all)
  - MIGRATION_DEFAULT_PASSWORD=ChangeMe123! (default: auto-generated per user)
  - AUTH_ALIAS_DOMAIN=syegtp.app (default: syegtp.app)
  - DRY_RUN=true|false (default: true)
*/

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const USER_FILTER_ROLE = (process.env.MIGRATION_USER_FILTER_ROLE || "all").toLowerCase();
const DEFAULT_PASSWORD = process.env.MIGRATION_DEFAULT_PASSWORD || "";
const AUTH_ALIAS_DOMAIN = process.env.AUTH_ALIAS_DOMAIN || "syegtp.app";
const DRY_RUN = String(process.env.DRY_RUN || "true").toLowerCase() !== "false";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

function normalizeLoginId(v) {
  return String(v || "").trim().toLowerCase();
}

function toUtf8Hex(v) {
  return Buffer.from(String(v || ""), "utf8").toString("hex");
}

function buildAuthEmailFromId(loginId) {
  const normalized = normalizeLoginId(loginId);
  const asciiLocal = normalized.replace(/[^a-z0-9._-]/g, "");
  const fallbackLocal = (`id${toUtf8Hex(normalized)}`).slice(0, 48);
  const local = (asciiLocal || fallbackLocal).replace(/^\.+|\.+$/g, "");
  if (!local) return "";
  return `${local}@${AUTH_ALIAS_DOMAIN}`;
}

function randomPassword() {
  const seed = Math.random().toString(36).slice(2, 10);
  return `SyEgtp!${seed}9A`;
}

async function sbFetch(path, init = {}) {
  const url = `${SUPABASE_URL.replace(/\/$/, "")}${path}`;
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = text;
  }
  if (!res.ok) {
    const msg = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`${res.status} ${res.statusText} :: ${msg}`);
  }
  return body;
}

async function getProfileUsers() {
  const query = new URLSearchParams({
    select: "id,name,role,approval_status",
    order: "created_at.asc",
  });
  if (USER_FILTER_ROLE === "player" || USER_FILTER_ROLE === "coach") {
    query.set("role", `eq.${USER_FILTER_ROLE}`);
  }
  return await sbFetch(`/rest/v1/sytpt_users?${query.toString()}`, {
    method: "GET",
    headers: { Prefer: "count=exact" },
  });
}

async function listAllAuthUsers() {
  const perPage = 200;
  let page = 1;
  const all = [];
  while (true) {
    const q = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    const data = await sbFetch(`/auth/v1/admin/users?${q.toString()}`, { method: "GET" });
    const users = Array.isArray(data?.users) ? data.users : [];
    all.push(...users);
    if (users.length < perPage) break;
    page += 1;
  }
  return all;
}

async function createAuthUser({ email, password, loginId, name, role }) {
  return await sbFetch("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        login_id: loginId,
        name: name || "",
        role: role || "",
      },
    }),
  });
}

async function updateAuthMetadata(userId, { loginId, name, role }) {
  return await sbFetch(`/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify({
      user_metadata: {
        login_id: loginId,
        name: name || "",
        role: role || "",
      },
    }),
  });
}

async function main() {
  console.log(`DRY_RUN=${DRY_RUN}`);
  const users = await getProfileUsers();
  const authUsers = await listAllAuthUsers();
  const authByEmail = new Map(
    authUsers
      .filter((u) => !!u?.email)
      .map((u) => [String(u.email).toLowerCase(), u])
  );
  if (!Array.isArray(users) || !users.length) {
    console.log("No users found in sytpt_users.");
    return;
  }

  let createdCount = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const u of users) {
    const loginId = String(u.id || "").trim();
    const email = buildAuthEmailFromId(loginId);

    if (!loginId || !email) {
      failed += 1;
      console.error(`[FAIL] invalid login id: ${u.id}`);
      continue;
    }

    try {
      const found = authByEmail.get(String(email).toLowerCase()) || null;
      if (found) {
        if (DRY_RUN) {
          console.log(`[DRY] update metadata ${loginId} -> ${email}`);
        } else {
          await updateAuthMetadata(found.id, {
            loginId,
            name: u.name,
            role: u.role,
          });
        }
        updated += 1;
        continue;
      }

      const newPassword = DEFAULT_PASSWORD || randomPassword();
      if (DRY_RUN) {
        console.log(`[DRY] create auth user ${loginId} -> ${email}`);
        skipped += 1;
      } else {
        const createdUser = await createAuthUser({
          email,
          password: newPassword,
          loginId,
          name: u.name,
          role: u.role,
        });
        if (createdUser?.email) {
          authByEmail.set(String(createdUser.email).toLowerCase(), createdUser);
        }
        createdCount += 1;
        console.log(`[OK] created ${loginId} -> ${email}`);
      }
    } catch (e) {
      failed += 1;
      console.error(`[FAIL] ${loginId}: ${e.message}`);
    }
  }

  console.log("---- SUMMARY ----");
  console.log(`updated metadata: ${updated}`);
  console.log(`created auth users: ${createdCount}`);
  console.log(`dry-run skipped create: ${skipped}`);
  console.log(`failed: ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
