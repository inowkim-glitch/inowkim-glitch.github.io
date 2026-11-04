진일 통합관리 PWA 1단계 — GitHub Pages 설치

1. 기존 GitHub index.html 백업 다운로드
2. 저장소 루트에 이 ZIP의 index.html, manifest.webmanifest, sw.js, icon-192.png, icon-512.png 업로드
3. GitHub Pages 배포 완료 후 https://inowkim-glitch.github.io/index.html 접속
4. 안드로이드 크롬 메뉴 > 홈 화면에 추가 또는 앱 설치
5. 홈 화면 아이콘 실행 후 기존 Supabase 로그인/숫자 저장/첨부파일 기능 확인

이 단계는 PWA 설치와 서비스 워커 준비 단계입니다. 실제 백그라운드 푸시 알림은 아직 발송되지 않습니다.
다음 단계에서 VAPID 키, Supabase 구독 테이블, 서버 발송 함수, 알림 허용 버튼을 연결해야 합니다.
