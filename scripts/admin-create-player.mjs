/**
 * admin-create-player.mjs
 * 
 * Supabase Auth rate limit 우회용 관리자 선수 계정 생성 스크립트.
 * Auth Admin API(서비스 롤 키 필요)로 계정을 생성하므로 브라우저 rate limit 영향 없음.
 * 
 * 사용법:
 *   $env:SUPABASE_URL="https://ksdmivjqgxdycupdbyrr.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="발급된_service_role_키"
 *   node .\scripts\admin-create-player.mjs --id "player01" --name "홍길동" --password "Pass1234!"
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ksdmivjqgxdycupdbyrr.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const AUTH_ALIAS_DOMAIN = process.env.AUTH_ALIAS_DOMAIN || 'syegtp.app';

// ── 인수 파싱 ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf('--' + name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const loginId  = getArg('id');
const name     = getArg('name');
const password = getArg('password');

if (!loginId || !name || !password) {
  console.error('사용법: node admin-create-player.mjs --id <ID> --name <이름> --password <비밀번호>');
  process.exit(1);
}

if (!SERVICE_KEY || SERVICE_KEY.includes('<') || SERVICE_KEY.includes('여기에') || SERVICE_KEY.length < 20) {
  console.error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.');
  console.error('  $env:SUPABASE_SERVICE_ROLE_KEY="실제_서비스_롤_키"');
  process.exit(1);
}

const authEmail = `${loginId}@${AUTH_ALIAS_DOMAIN}`;

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

// ── 기존 Auth 사용자 확인 ─────────────────────────────────────────────────
async function findAuthUserByEmail(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`, { headers });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Auth 사용자 목록 조회 실패 (${res.status}): ${t}`);
  }
  const data = await res.json();
  const users = data.users || [];
  return users.find(u => u.email === email) || null;
}

// ── Auth 사용자 생성 ──────────────────────────────────────────────────────
async function createAuthUser(email, pw, meta) {
  const body = { email, password: pw, email_confirm: true, user_metadata: meta };
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Auth 계정 생성 실패 (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

// ── Auth 사용자 비밀번호 업데이트 ──────────────────────────────────────────
async function updateAuthPassword(userId, pw) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT', headers, body: JSON.stringify({ password: pw, email_confirm: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`비밀번호 업데이트 실패 (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

// ── sytpt_users upsert ────────────────────────────────────────────────────
async function upsertPlayerRow(id, playerName) {
  const body = [{
    id: id,
    name: playerName,
    role: 'player',
    approval_status: 'pending',
    today_completion: '0%',
    risk_level: '정상',
    created_at: new Date().toISOString(),
  }];
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sytpt_users?on_conflict=id`,
    { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`sytpt_users upsert 실패 (${res.status}): ${t}`);
  }
}

// ── 메인 ──────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n선수 계정 생성 시작: ID="${loginId}", 이름="${name}"`);
  console.log(`Auth 이메일: ${authEmail}`);

  // 1. 기존 Auth 계정 확인
  let existingUser = null;
  try {
    existingUser = await findAuthUserByEmail(authEmail);
  } catch (e) {
    console.error('Auth 사용자 조회 중 오류:', e.message);
    process.exit(1);
  }

  // 2. Auth 계정 생성 or 비밀번호 업데이트
  let authUser;
  if (existingUser) {
    console.log(`기존 Auth 계정 발견 (id=${existingUser.id}). 비밀번호를 업데이트합니다.`);
    try {
      authUser = await updateAuthPassword(existingUser.id, password);
      console.log('비밀번호 업데이트 완료.');
    } catch (e) {
      console.error('비밀번호 업데이트 실패:', e.message);
      process.exit(1);
    }
  } else {
    console.log('Auth 계정 신규 생성 중...');
    try {
      authUser = await createAuthUser(authEmail, password, { login_id: loginId, name, role: 'player' });
      console.log('Auth 계정 생성 완료. ID:', authUser.id);
    } catch (e) {
      console.error('Auth 계정 생성 실패:', e.message);
      process.exit(1);
    }
  }

  // 3. sytpt_users 테이블 upsert (pending 상태)
  console.log('sytpt_users 테이블에 선수 정보 등록 중...');
  try {
    await upsertPlayerRow(loginId, name);
    console.log('sytpt_users 등록 완료.');
  } catch (e) {
    console.error('sytpt_users 등록 실패:', e.message);
    console.error('Auth 계정은 생성되었으나 DB 행 추가가 실패했습니다. 수동으로 추가하거나 스크립트를 재실행하세요.');
    process.exit(1);
  }

  console.log(`\n완료! "${name}" 선수 계정이 pending 상태로 생성되었습니다.`);
  console.log('코치가 앱에서 해당 선수를 승인하면 로그인이 가능합니다.');
})();
