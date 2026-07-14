test
한베커플 홈페이지 구조

공개 홈페이지
- index.html: 메인 화면
- application.html: 매칭 신청서
- process.html, fee.html, privacy.html, terms.html, compensation.html: 안내 페이지
- assets/css/style.css: 홈페이지 스타일
- assets/js/application.js: 신청서 제출 기능
- assets/js/supabase-config.js: 공개용 Supabase 연결 정보
- assets/js/recent-status.js: 최근 접수 현황 표시
- assets/js/vietnam-stories.js: 베트남 이야기 6칸 표시
- assets/images/: 홈페이지 이미지
- data/recent-status.json: 최근 베트남 여성회원 접수 현황 데이터
- data/vietnam-stories.json: 베트남 이야기 이미지/문구/링크 데이터

로컬 관리자
- local-admin/: 내 PC에서만 실행하는 관리자 화면
- local-admin/data/applications_rows.csv: 신청서 CSV 저장 위치
- local-admin/.env: Supabase 직접 다운로드용 비공개 설정 파일

로컬 관리자 실행
1. local-admin/.env.example 파일을 복사해서 local-admin/.env 파일을 만듭니다.
2. local-admin/.env에 SUPABASE_URL과 SUPABASE_SECRET_KEY를 입력합니다.
3. local-admin/start-local-admin.bat 파일을 실행합니다.
4. 브라우저에서 http://127.0.0.1:5177 로 접속합니다.

주의
- local-admin/.env에는 Secret key가 들어가므로 GitHub에 올리면 안 됩니다.
- .gitignore에 local-admin/.env가 포함되어 있습니다.
- 홈페이지에 공개되는 키는 assets/js/supabase-config.js의 Publishable key만 사용합니다.
