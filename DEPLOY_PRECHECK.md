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

## 7) 샷거리시뮬레이터
- 선수포탈 > 시합준비 > 오늘경기데이터 입력 왼쪽의 `샷거리시뮬레이터` 버튼으로 새 탭에서 실행합니다.
- 소스: `shot-distance-simulator/App.tsx`. 다운로드 폴더의 원본이나 로컬 미리보기 서버에 의존하지 않습니다.
- VS Code에서 수정할 파일도 `shot-distance-simulator/App.tsx`입니다. 다운로드 폴더의 단독 TSX는 React 의존성을 찾지 못하므로 프로젝트 파일 대신 사용하지 않습니다.
- `tsconfig.json`으로 에디터의 React JSX·엄격한 타입 검사를 설정하며, `npm run typecheck`로 동일 프로젝트를 검사합니다. `npm run build`도 타입 검사 성공 후에만 빌드합니다.
- 수정 후 `shot-distance-simulator`에서 `npm ci`, `npm test`, `npm run build`를 실행합니다.
- `shot-distance-simulator/dist`의 HTML과 assets를 함께 배포/커밋해야 합니다. 현재 Pages 워크플로는 저장소의 정적 파일을 그대로 배포합니다.
- 배포 페이지는 `shot-distance-simulator/dist/index.html`이며, React·스타일을 로컬 assets에 포함하므로 실행 시 npm/CDN이 필요하지 않습니다.
- 개인 입력은 접속 도메인의 브라우저 localStorage에 클럽별로 저장됩니다. 로컬 미리보기의 개인 입력은 배포 도메인으로 자동 이전되지 않으며 선수 계정 간 동기화도 하지 않습니다.
- 배포 확인: 버튼 위치/새 탭 열기, 투어·개인 입력 전환, 개인 데이터 재접속 유지, 측면/위에서 보기, 샷 실행/리셋.
