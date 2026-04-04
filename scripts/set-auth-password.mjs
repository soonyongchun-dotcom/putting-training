#!/usr/bin/env node
/*
  Set Supabase Auth password for a specific user.

  Required env:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY

  Usage examples:
  node ./scripts/set-auth-password.mjs --uid 84d579ea-8e97-41dc-a568-3e4130e664b1 --password "NewPass!1234"
  node ./scripts/set-auth-password.mjs --login-id "전순용" --password "NewPass!1234"
*/

const args = process.argv.slice(2);
function argValue(name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return "";
  return args[idx + 1];
}

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const uid = argValue("--uid");
const loginId = argValue("--login-id");
const password = argValue("--password");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
if (!password || password.length < 8) {
  console.error("--password is required and must be at least 8 chars.");
  process.exit(1);
}
if (!uid && !loginId) {
  console.error("Provide either --uid or --login-id.");
  process.exit(1);
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
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} :: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
  return body;
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

async function updatePasswordByUid(targetUid, newPassword) {
  return await sbFetch(`/auth/v1/admin/users/${targetUid}`, {
    method: "PUT",
    body: JSON.stringify({ password: newPassword }),
  });
}

(async function main() {
  let targetUid = uid;

  if (!targetUid) {
    const users = await listAllAuthUsers();
    const matched = users.find((u) => {
      const md = u?.user_metadata || {};
      return String(md.login_id || "") === loginId;
    });
    if (!matched) {
      console.error(`No auth user found for login_id='${loginId}'`);
      process.exit(1);
    }
    targetUid = matched.id;
  }

  await updatePasswordByUid(targetUid, password);
  console.log(`Password updated for uid=${targetUid}`);
})();
