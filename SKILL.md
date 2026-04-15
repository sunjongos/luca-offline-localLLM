---
name: "LUCA Offline LocalLLM Extension Installer"
description: "GitHub에서 luca-offline-localLLM 레포를 clone/pull → 빌드 → VS Code/Antigravity에 로컬 LLM 멀티모달 채팅 Extension을 자동 설치하는 End-to-End 스킬"
---

# 🤖 LUCA Offline LocalLLM — End-to-End Extension Installer

> **GitHub 레포 pull → 빌드 → Antigravity/VS Code 자동 설치**까지 원스톱 자동화

## 🎯 용도

- "Antigravity에 로컬 LLM 익스텐션 설치해줘" 라고 하면 이 스킬을 실행
- 집 컴퓨터, 새 PC 등 어디서든 한 줄이면 끝
- 멀티모달(이미지 첨부) + Ollama 로컬 LLM 코딩 어시스턴트 자동 배포

## 📋 전제 조건

| 필수 | 버전 | 설치 방법 |
|------|------|-----------|
| Node.js | 18+ | `winget install OpenJS.NodeJS` |
| Git | any | `winget install Git.Git` |
| Ollama | latest | `winget install Ollama.Ollama` |
| VS Code / Antigravity | 1.85+ | 이미 설치되어 있어야 함 |

## 🚀 실행 절차 (에이전트용)

### 방법 1: PowerShell 스크립트 (추천)

에이전트가 아래 단계를 **순서대로** 실행합니다:

```powershell
# Step 1: 레포 클론 또는 업데이트
$REPO_DIR = "$HOME\luca-offline-localLLM"
$REPO_URL = "https://github.com/sunjongos/luca-offline-localLLM.git"

if (Test-Path "$REPO_DIR\.git") {
  Push-Location $REPO_DIR
  git pull --ff-only origin master
  Pop-Location
} else {
  git clone $REPO_URL $REPO_DIR
}

# Step 2: 의존성 설치
Set-Location $REPO_DIR
npm install --no-audit --no-fund

# Step 3: TypeScript 컴파일
npm run compile

# Step 4: VSIX 패키징
npx -y @vscode/vsce package --no-dependencies

# Step 5: Extension 설치 (code 또는 antigravity)
$vsix = Get-ChildItem "$REPO_DIR\*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
code --install-extension $vsix.FullName --force

# Step 6: Ollama 모델 확인/다운로드
ollama pull gemma4:e4b

# Step 7: Ollama 서버 시작 (백그라운드)
Start-Process -NoNewWindow ollama -ArgumentList "serve"
```

### 방법 2: 자동 설치 스크립트 (원클릭)

레포 안에 포함된 `scripts/install.ps1` 을 사용:

```powershell
# 기본 설치 (VS Code 자동 감지)
.\scripts\install.ps1

# 특정 경로에 클론
.\scripts\install.ps1 -RepoDir "D:\luca-offline-localLLM"

# Ollama 모델 풀 생략
.\scripts\install.ps1 -SkipModel

# 특정 에디터 지정
.\scripts\install.ps1 -Editor "antigravity"
```

### 방법 3: 원라인 (새 PC에서 바로 실행)

```powershell
git clone https://github.com/sunjongos/luca-offline-localLLM.git $HOME\luca-offline-localLLM; cd $HOME\luca-offline-localLLM; npm install; npm run compile; npx -y @vscode/vsce package --no-dependencies; code --install-extension (Get-ChildItem *.vsix | Select-Object -First 1).FullName --force
```

## ✅ 설치 확인 체크리스트

스킬 실행 후 다음을 검증:

1. **빌드 성공**: `out/extension.js` 파일 존재 확인
2. **VSIX 생성**: `*.vsix` 파일 생성 확인
3. **Extension 설치**: `antigravity --list-extensions` 에서 `sunjongos.luca-offline` 확인
4. **Ollama 연결**: `curl http://localhost:11434/api/tags` 응답 확인
5. **사이드바**: VS Code 왼쪽 사이드바에 🤖 아이콘 표시 확인

## 🔧 트러블슈팅

| 문제 | 해결 |
|------|------|
| `npm run compile` 실패 | `npm install` 재실행, `node_modules` 삭제 후 재시도 |
| VSIX 패키징 실패 | `npx -y @vscode/vsce package --no-dependencies --allow-missing-repository` |
| Ollama 연결 안됨 | `ollama serve` 실행, 방화벽 확인 |
| Extension 안 보임 | VS Code 재시작 (Ctrl+Shift+P → Reload Window) |
| 이미지 첨부 안됨 | Vision 모델 필요: `ollama pull llava:7b` 또는 `gemma4:e4b` |

## 📦 Extension 기능 요약

| 기능 | 설명 |
|------|------|
| 💬 실시간 스트리밍 채팅 | Ollama SSE 기반 토큰 스트리밍 |
| 📷 멀티모달 이미지 | Ctrl+V 붙여넣기, 드래그앤드롭, 파일 첨부 |
| 📝 Markdown 렌더링 | 코드 블록, 복사/삽입 버튼 |
| 🔄 모델 핫스왑 | 상태바 클릭으로 모델 전환 |
| 🎯 코드 컨텍스트 | 선택 코드 + 파일 전체를 자동 주입 |
| ⌨️ 단축키 | Ctrl+Shift+L 선택 코드 질문 |
| 🔒 100% 오프라인 | 인터넷 불필요, 로컬 전용 |

## 🔗 관련 리소스

- **GitHub**: https://github.com/sunjongos/luca-offline-localLLM
- **Ollama**: https://ollama.com
- **VS Code API**: https://code.visualstudio.com/api
