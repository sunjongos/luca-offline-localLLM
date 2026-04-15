<#
.SYNOPSIS
  LUCA Offline LocalLLM — End-to-End Installer for VS Code / Antigravity
  GitHub: https://github.com/sunjongos/luca-offline-localLLM

.DESCRIPTION
  This script automates the full installation pipeline:
  1. Checks prerequisites (Node.js, npm, Ollama)
  2. Clones or updates the repo from GitHub
  3. Installs npm dependencies
  4. Compiles TypeScript → JavaScript
  5. Packages into .vsix
  6. Installs the .vsix into VS Code / Antigravity
  7. Verifies installation
  8. Optionally pulls the default Ollama model

.PARAMETER RepoDir
  Where to clone/update the repo. Default: $HOME\luca-offline-localLLM

.PARAMETER SkipModel
  If set, skips Ollama model pull step.

.PARAMETER Editor
  Target editor: 'code' (VS Code), 'antigravity', or 'cursor'. Default: auto-detect.

.EXAMPLE
  .\install.ps1
  .\install.ps1 -RepoDir "D:\projects\luca-offline-localLLM" -Editor "code"
  .\install.ps1 -SkipModel
#>

param(
  [string]$RepoDir = "$HOME\luca-offline-localLLM",
  [switch]$SkipModel,
  [string]$Editor = ""
)

$ErrorActionPreference = "Stop"
$REPO_URL = "https://github.com/sunjongos/luca-offline-localLLM.git"
$DEFAULT_MODEL = "gemma4:e4b"

# ===== Helpers =====
function Write-Step($step, $msg) {
  Write-Host ""
  Write-Host "[$step] $msg" -ForegroundColor Cyan
  Write-Host ("-" * 50) -ForegroundColor DarkGray
}

function Write-Ok($msg) {
  Write-Host "  ✅ $msg" -ForegroundColor Green
}

function Write-Warn($msg) {
  Write-Host "  ⚠️  $msg" -ForegroundColor Yellow
}

function Write-Fail($msg) {
  Write-Host "  ❌ $msg" -ForegroundColor Red
}

function Test-Command($cmd) {
  try { Get-Command $cmd -ErrorAction Stop | Out-Null; return $true }
  catch { return $false }
}

# ===== Auto-detect editor =====
function Find-Editor {
  if ($Editor) { return $Editor }
  
  # Priority: antigravity > code > cursor
  if (Test-Command "antigravity") { return "antigravity" }
  if (Test-Command "code") { return "code" }
  if (Test-Command "cursor") { return "cursor" }
  
  # Fallback: search common paths
  $paths = @(
    "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd",
    "$env:LOCALAPPDATA\Programs\Antigravity\bin\antigravity.cmd",
    "$env:LOCALAPPDATA\Programs\cursor\resources\app\bin\cursor.cmd"
  )
  foreach ($p in $paths) {
    if (Test-Path $p) { return $p }
  }
  
  return ""
}

# =============================================
# STEP 1: Prerequisites Check
# =============================================
Write-Host ""
Write-Host "🤖 LUCA Offline LocalLLM — Automated Installer" -ForegroundColor Magenta
Write-Host "================================================" -ForegroundColor Magenta
Write-Host ""

Write-Step "1/7" "Prerequisites check"

# Node.js
if (Test-Command "node") {
  $nodeVer = (node --version 2>$null)
  Write-Ok "Node.js $nodeVer"
} else {
  Write-Fail "Node.js not found. Install: https://nodejs.org"
  exit 1
}

# npm
if (Test-Command "npm") {
  $npmVer = (npm --version 2>$null)
  Write-Ok "npm v$npmVer"
} else {
  Write-Fail "npm not found."
  exit 1
}

# Git
if (Test-Command "git") {
  Write-Ok "git available"
} else {
  Write-Fail "git not found. Install: https://git-scm.com"
  exit 1
}

# Editor
$editorCmd = Find-Editor
if ($editorCmd) {
  Write-Ok "Editor: $editorCmd"
} else {
  Write-Fail "No compatible editor found (code/antigravity/cursor)"
  exit 1
}

# Ollama (optional but recommend)
if (Test-Command "ollama") {
  Write-Ok "Ollama available"
} else {
  Write-Warn "Ollama not found. Install: https://ollama.com"
  Write-Warn "Extension will install but won't work without Ollama."
}

# =============================================
# STEP 2: Clone or Update Repository
# =============================================
Write-Step "2/7" "Clone / Update repository"

if (Test-Path "$RepoDir\.git") {
  Write-Host "  Repository exists at $RepoDir, pulling latest..." -ForegroundColor Gray
  Push-Location $RepoDir
  git pull --ff-only origin master 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
  Pop-Location
  Write-Ok "Repository updated"
} else {
  Write-Host "  Cloning from $REPO_URL ..." -ForegroundColor Gray
  git clone $REPO_URL $RepoDir 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
  Write-Ok "Repository cloned to $RepoDir"
}

# =============================================
# STEP 3: Install npm dependencies
# =============================================
Write-Step "3/7" "Install npm dependencies"

Push-Location $RepoDir
npm install --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
Write-Ok "Dependencies installed"

# =============================================
# STEP 4: Compile TypeScript
# =============================================
Write-Step "4/7" "Compile TypeScript → JavaScript"

npm run compile 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }

if (Test-Path "$RepoDir\out\extension.js") {
  Write-Ok "Compilation successful (out/extension.js)"
} else {
  Write-Fail "Compilation failed — out/extension.js not found"
  Pop-Location
  exit 1
}

# =============================================
# STEP 5: Package VSIX
# =============================================
Write-Step "5/7" "Package .vsix extension"

# Get version from package.json
$pkgJson = Get-Content "$RepoDir\package.json" -Raw | ConvertFrom-Json
$extName = $pkgJson.name
$extVer = $pkgJson.version
$vsixFile = "$extName-$extVer.vsix"

npx -y @vscode/vsce package --no-dependencies 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }

if (Test-Path "$RepoDir\$vsixFile") {
  $size = [math]::Round((Get-Item "$RepoDir\$vsixFile").Length / 1KB, 1)
  Write-Ok "VSIX created: $vsixFile (${size} KB)"
} else {
  # Try to find any .vsix file
  $foundVsix = Get-ChildItem "$RepoDir\*.vsix" | Select-Object -First 1
  if ($foundVsix) {
    $vsixFile = $foundVsix.Name
    $size = [math]::Round($foundVsix.Length / 1KB, 1)
    Write-Ok "VSIX found: $vsixFile (${size} KB)"
  } else {
    Write-Fail "VSIX packaging failed"
    Pop-Location
    exit 1
  }
}

# =============================================
# STEP 6: Install Extension
# =============================================
Write-Step "6/7" "Install extension into editor"

$installResult = & $editorCmd --install-extension "$RepoDir\$vsixFile" --force 2>&1
$installResult | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }

if ($LASTEXITCODE -eq 0 -or ($installResult -match "successfully installed")) {
  Write-Ok "Extension installed: $vsixFile"
} else {
  Write-Warn "Installation may have issues. Check editor extensions panel."
}

Pop-Location

# =============================================
# STEP 7: Ollama Model (optional)
# =============================================
Write-Step "7/7" "Ollama model setup"

if ($SkipModel) {
  Write-Host "  Skipped (--SkipModel flag)" -ForegroundColor Gray
} elseif (Test-Command "ollama") {
  Write-Host "  Checking model: $DEFAULT_MODEL ..." -ForegroundColor Gray
  $modelList = ollama list 2>$null
  if ($modelList -match $DEFAULT_MODEL.Replace(":", "\:")) {
    Write-Ok "Model '$DEFAULT_MODEL' already available"
  } else {
    Write-Host "  Pulling $DEFAULT_MODEL (this may take a few minutes)..." -ForegroundColor Yellow
    ollama pull $DEFAULT_MODEL 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    Write-Ok "Model '$DEFAULT_MODEL' pulled successfully"
  }
  
  # Check if ollama server is running
  try {
    $response = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 3 -ErrorAction SilentlyContinue
    Write-Ok "Ollama server is running"
  } catch {
    Write-Warn "Ollama server not running. Start with: ollama serve"
  }
} else {
  Write-Warn "Ollama not installed. Install from https://ollama.com"
}

# =============================================
# DONE
# =============================================
Write-Host ""
Write-Host "================================================" -ForegroundColor Magenta
Write-Host "🎉 Installation Complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  📦 Extension: $extName v$extVer" -ForegroundColor Cyan
Write-Host "  📂 Repo: $RepoDir" -ForegroundColor Cyan
Write-Host "  🖥️  Editor: $editorCmd" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Yellow
Write-Host "  1. Restart your editor (or reload window: Ctrl+Shift+P → Reload)" -ForegroundColor Gray
Write-Host "  2. Make sure Ollama is running: ollama serve" -ForegroundColor Gray
Write-Host "  3. Look for the 🤖 icon in the sidebar!" -ForegroundColor Gray
Write-Host ""
