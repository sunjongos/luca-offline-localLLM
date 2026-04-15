# Changelog

## [1.1.0] - 2026-04-15

### 🖼️ Multimodal Image Support
- **이미지 붙여넣기** — Ctrl+V로 클립보드 이미지 즉시 첨부
- **드래그 앤 드롭** — 이미지를 채팅창에 드래그하면 자동 첨부
- **파일 선택** — `+` 버튼으로 네이티브 파일 피커 (PNG/JPG/GIF/WebP)
- **섬네일 미리보기** — 첨부 이미지 미리보기 + ✕ 제거 버튼
- **Ollama Vision API** — base64 이미지를 vision 모델에 전달

### 🔧 End-to-End Installer
- **scripts/install.ps1** — 원클릭 자동 설치 스크립트 추가
- **SKILL.md** — AI 에이전트용 E2E 스킬 명세 추가
- 전제 조건 자동 검증 (Node.js, Git, Ollama)
- VS Code / Antigravity / Cursor 자동 감지

### 📛 Branding
- LUCA (Local LLMs In-Code Assistant) 브랜딩 적용
- 드래그 오버레이 UI, 이미지 미리보기 바 추가
- 포커스 글로우 효과, 퍼플 테마 강화

## [1.0.0] - 2026-04-15

### 🎉 Initial Release

- **Sidebar Chat UI** — VS Code 사이드바에서 로컬 AI와 채팅
- **Ollama Integration** — 로컬 Ollama 서버와 HTTP API 연동
- **Real-time Streaming** — SSE 기반 실시간 토큰 스트리밍
- **Markdown Rendering** — 코드 블록 (복사/삽입), 볼드/이탤릭, 리스트
- **Code Context** — 현재 파일 + 선택 영역 자동 프롬프트 주입
- **Model Hot-swap** — 상태바 클릭으로 Ollama 모델 전환
- **Custom Modelfile** — E4B 인턴 페르소나 Modelfile 제공
