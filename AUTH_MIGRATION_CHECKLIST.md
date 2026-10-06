# SY-EGTP Auth Migration Checklist

이 문서는 index3.html에서 Supabase Auth 기반 로그인으로 전환된 이후, 운영에서 필요한 이관/검증 절차를 정리합니다.

## 1) 사전 준비
- Supabase Auth Email provider 활성화 여부 확인
- 클라이언트에 anon key만 사용 중인지 확인
- 기존 코치/선수 계정 목록 확보: sytpt_users(id, name, role, approval_status)

## 2) 계정 이메일 규칙
- 앱은 내부적으로 아래 이메일 규칙으로 로그인합니다.
- 기본 규칙: <login_id_alias>@syegtp.app
- 레거시 로그인 호환: <login_id_alias>@syegtp.local
- login_id_alias 생성 방식:
  - 영문/숫자/._- 만 있으면 그대로 사용
  - 그 외 문자가 포함되면 UTF-8 hex 기반 id 접두 별칭 사용

## 3) 기존 계정 Auth 이관
- 기존 sytpt_users 레코드마다 Auth 계정이 존재해야 로그인 가능
- 이미 존재하면 건너뛰고, 없으면 생성
- 생성 시 user_metadata에 login_id, name, role 저장 권장

권장 메타데이터:
- login_id: sytpt_users.id
- name: sytpt_users.name
- role: sytpt_users.role

## 4) 앱 동작 검증
- 선수 승인 상태별 로그인 결과
  - approved: 로그인 성공
  - pending/inactive: 로그인 차단 + pending 화면 안내
- 관리자(코치) 로그인
  - Auth 로그인 성공 여부 확인
  - 실패 시 이관 스크립트로 Auth 계정/메타데이터 매핑 상태 점검
- 새로고침 후 세션 유지 검증
  - Auth 세션 유효: 자동 복원
  - Auth 세션 없음: 로컬 세션 자동 초기화
- 로그아웃 검증
  - Supabase Auth signOut + 로컬 세션 제거

### 같은 기기의 자동 로그인 및 앱 간 공유
- index3.html과 index4.html은 sytpt-auth.js의 동일한 Supabase 세션 저장소(`sytpt_sb_auth`)를 사용합니다. 배포 시 이 공통 파일도 함께 올려야 합니다.
- 로그인 성공 후 비밀번호가 아닌 Supabase access/refresh token을 브라우저 localStorage에 저장합니다. 새로고침·다음 실행 시 토큰 갱신과 서버 사용자 확인 후 DB 프로필 권한을 다시 검사합니다.
- index4.html은 코치만 허용합니다. 선수 세션으로 분석 앱에 접근해도 index3.html의 선수 로그인은 유지됩니다.
- index3.html의 스윙모션분석 연결은 같은 배포의 index4.html을 열어 세션을 공유합니다. HTTPS 사이트의 동일한 origin·브라우저 프로필에서 사용하세요. 로컬 file:// 실행의 저장소 공유는 브라우저에 따라 보장되지 않습니다.
- 로그아웃하면 공유 세션을 삭제합니다. 브라우저 데이터 삭제, 서버 세션 만료·취소, 비공개 모드 또는 저장소 차단 시 다시 로그인해야 합니다. 공용 기기에서는 사용 후 로그아웃하세요.
- 로그인 ID/실제 이메일, 기본·레거시 별칭, 이전 성공 이메일 힌트를 두 앱에서 동일하게 처리합니다. 별칭 후보가 `invalid_credentials`로 실패하고 다음 후보가 성공하는 경우 개발자 도구에 HTTP 400이 남을 수 있습니다.
- HTTP 400만으로 원인을 확정할 수 없습니다. 화면 오류와 Supabase 응답 `code`를 확인하세요: `invalid_credentials`는 ID/비밀번호 또는 Auth 계정 매핑, `email_not_confirmed`는 이메일 인증, 429는 인증 요청 제한입니다.
- 검증: index3 로그인 → index4 자동 로그인 → 각각 새로고침 → 브라우저 재실행 → 로그아웃 후 두 앱 차단. 승인 대기/비활성 선수의 자동 복원도 차단되는지 확인합니다.
- 자동 회귀 테스트: `node --test scripts/test-shared-auth.mjs` (실제 Supabase 계정 요청 없이 저장소·이메일 후보·복원·권한·로그아웃 검사).

## 5) 보안 정리
- sytpt_users.password 컬럼을 더 이상 사용하지 않음
- 운영 안정화 후 password 컬럼 제거 권장
- 가능한 모든 select('*')는 명시 컬럼 조회로 유지

## 6) RLS 권장 방향
- sytpt_users
  - 선수: 본인 행만 읽기
  - 코치: 필요한 범위만 읽기/수정
- sytpt_messages, sytpt_coach_directives, sytpt_assigned_missions 등
  - 선수: 본인 player_id 데이터만 접근
  - 코치: 담당/전체 정책을 운영 정책에 맞게 최소 권한으로 설계

## 7) 롤백 포인트
- 문제 발생 시 앱 코드를 이전 커밋으로 되돌리기 전에
  - Auth 계정 생성/변경 내역 백업
  - sytpt_users 데이터 백업
  - RLS 정책 변경 내역 백업

## 8) 권장 실행 순서 (이번 배포용)
1. DRY RUN으로 Auth 계정 매핑 검증
2. 실제 Auth 계정 생성/메타데이터 동기화
3. RLS 정책 적용
4. 운영 검증 완료 후 password 컬럼 제거

### 8-1) 이관 스크립트 실행 예시
```powershell
$env:SUPABASE_URL="https://<project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
$env:DRY_RUN="true"
node .\scripts\migrate-users-to-auth.mjs
```

실행 생성으로 전환:
```powershell
$env:DRY_RUN="false"
node .\scripts\migrate-users-to-auth.mjs
```

### 8-2) SQL 적용 파일
- RLS 기초 정책: sql/02_rls_baseline_policies.sql
- password 컬럼 제거: sql/01_password_column_deprecation.sql
