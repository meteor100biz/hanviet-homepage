한베커플 로컬 관리자

기능
- 홈페이지 관리: 최근 접수 현황 수정
- 홈페이지 관리: 베트남 이야기 6칸의 이미지, 문구, 링크 수정
- 신청서 관리: local-admin/data/applications_rows.csv 읽기
- 신청서 관리: CSV 파일 직접 가져오기
- 신청서 관리: Supabase applications 테이블 직접 다운로드

Supabase 설정
1. .env.example 파일을 복사해서 .env 파일을 만듭니다.
2. .env에 아래 값을 입력합니다.

SUPABASE_URL=https://프로젝트아이디.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_TABLE=applications
SUPABASE_STORAGE_BUCKET=member-photo
PORT=5177

실행
npm start

Node.js가 PATH에 잡혀 있지 않으면 start-local-admin.bat 파일을 실행해도 됩니다.

접속
http://127.0.0.1:5177

데이터 반영 흐름
1. 로컬 관리자에서 홈페이지 데이터를 수정합니다.
2. data/recent-status.json 또는 data/vietnam-stories.json이 저장됩니다.
3. 변경된 파일을 GitHub에 올립니다.
4. Vercel 배포 후 홈페이지에 반영됩니다.

신청서 저장/삭제 흐름
1. 관리자 실행 시 로컬 저장 목록과 Supabase 목록을 함께 읽습니다.
2. Supabase에만 있는 신청서는 "로컬 저장" 버튼이 표시됩니다.
3. 로컬 저장을 누르면 local-admin/applicants 폴더에 HTML, data.json, 사진 파일이 저장됩니다.
4. 로컬과 Supabase 양쪽에 있는 신청서는 "Supabase 삭제" 버튼이 표시됩니다.
5. Supabase 삭제를 누르면 applications 행과 Storage 사진을 삭제합니다.
