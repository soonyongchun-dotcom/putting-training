# Deploy Precheck (Security + Auth)

최종 배포 목표: 민감정보는 서버(환경변수)에서만 사용하고, 클라이언트는 publishable key만 사용.

## 배포 대상 파일
- 기본: `index3.html`
- 대체: `deployed_index3.html` (동일 publishable key 기준)
- 배포 제외 권장: `Desktop/Golfworks/Projects_Loc/index3.html` (로컬 사본)

## 1) 키 점검 (커밋 전)
PowerShell:
```powershell
rg -n "SUPABASE_SERVICE_ROLE_KEY|sb_service_|sb_secret_|eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}" .
```
- 결과가 스크립트 설명/주석 외에 실제 키값이면 커밋 중단

## 2) 별칭 도메인 일치
- 앱 런타임 기본 별칭: `syegtp.app`
- 레거시 로그인 호환: `syegtp.local`
- 마이그레이션 실행 시 필요하면 환경변수로 명시:
```powershell
$env:AUTH_ALIAS_DOMAIN="syegtp.app"
```

## 3) 서버 전용 비밀
- 필수: `SUPABASE_SERVICE_ROLE_KEY`는 터미널 세션/CI secret에만 설정
- 금지: HTML/JS 파일에 service role key 하드코딩

## 4) 배포 직전 기능 확인
- 선수 가입: pending 생성
- 코치 로그인: 성공
- 승인 대기 목록: 신규 선수 표시
- 메시지 첨부 열기: 404 Bucket not found 없음

## 5) Supabase 운영 상태
- Auth > Providers > Email: enabled
- SQL hotfix 반영 여부:
  - `sql/06_rls_allow_player_signup_insert.sql`
  - `sql/07_storage_attachments_bucket_hotfix.sql`

## 6) 커밋 권장 범위
- 포함: `index3.html`, `deployed_index3.html`, `scripts/*`, `sql/*`, 문서
- 제외: 로컬 실험용 사본/개인 경로 파일
