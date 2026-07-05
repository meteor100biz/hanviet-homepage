HAN-VIET COUPLE HOMEPAGE v4 - Supabase application form

업로드 방법:
1. 이 압축파일을 풀어 GitHub 저장소 루트에 그대로 업로드합니다.
2. 기존 파일을 모두 덮어씁니다.
3. GitHub에서 Commit changes를 누르면 Vercel이 자동 배포합니다.

Supabase 설정:
1. supabase-config.js 파일을 엽니다.
2. HANVIET_SUPABASE_KEY 값에 Supabase > Project Settings > API Keys > Publishable key 전체값을 붙여넣습니다.
3. Secret key(sb_secret_...)는 절대 넣지 마세요.

연동 내용:
- application.html : 매칭 신청서 페이지
- application.js : Supabase Storage 사진 업로드 및 applications 테이블 저장 코드
- supabase-config.js : Supabase URL / Publishable key 설정 파일
- Storage bucket : member-photo
- Storage upload path : applications/파일명
- Database table : public.applications

주의:
- 현재 supabase-config.js의 Publishable key는 자리표시자입니다.
- 이 값을 실제 Publishable key로 바꾸지 않으면 신청서 제출이 동작하지 않습니다.

홈페이지 주소:
https://hanviet.co.kr/
