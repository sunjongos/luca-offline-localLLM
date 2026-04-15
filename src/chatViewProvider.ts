import * as vscode from 'vscode';
import { OllamaClient, OllamaMessage } from './ollamaClient';
import { buildContext, formatContextForPrompt } from './contextBuilder';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'luca-offline.chatView';

  private _view?: vscode.WebviewView;
  private _ollamaClient: OllamaClient;
  private _messages: OllamaMessage[] = [];
  private _currentModel: string;
  private _abortSignal: { aborted: boolean } = { aborted: false };

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _statusBarItem: vscode.StatusBarItem
  ) {
    const config = vscode.workspace.getConfiguration('lucaOffline');
    const ollamaUrl = config.get<string>('ollamaUrl', 'http://localhost:11434');
    this._currentModel = config.get<string>('defaultModel', 'gemma4:e2b');
    this._ollamaClient = new OllamaClient(ollamaUrl);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'media'),
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'sendMessage':
          await this._handleUserMessage(data.text, data.images || []);
          break;
        case 'switchModel':
          await this._switchModel();
          break;
        case 'clearChat':
          this._clearChat();
          break;
        case 'stopGeneration':
          this._abortSignal.aborted = true;
          break;
        case 'insertCode':
          this._insertCodeToEditor(data.code);
          break;
        case 'pickImage':
          await this._pickImageFile();
          break;
        case 'ready':
          this._sendModelsToWebview();
          this._checkConnection();
          break;
      }
    });

    // Retain context when hidden
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._checkConnection();
      }
    });
  }

  /**
   * Send a message with selected code context
   */
  public async askAboutSelection(): Promise<void> {
    const ctx = buildContext();
    if (!ctx || !ctx.selectedText) {
      vscode.window.showWarningMessage('코드를 선택한 후 다시 시도해주세요.');
      return;
    }

    const question = await vscode.window.showInputBox({
      prompt: '선택한 코드에 대해 무엇을 물어볼까요?',
      placeHolder: '이 코드를 설명해줘 / 버그 찾아줘 / 리팩토링해줘...',
    });

    if (!question) {return;}

    const contextStr = formatContextForPrompt(ctx);
    const fullQuestion = `${question}\n${contextStr}`;

    // Focus the chat panel
    if (this._view) {
      this._view.show(true);
    }

    await this._handleUserMessage(fullQuestion);
  }

  /**
   * Handle incoming user message (optionally with images)
   */
  private async _handleUserMessage(userText: string, images: string[] = []): Promise<void> {
    if (!this._view) {return;}

    // Get config
    const config = vscode.workspace.getConfiguration('lucaOffline');
    const systemPrompt = config.get<string>('systemPrompt', '');
    const maxLines = config.get<number>('maxContextLines', 200);

    // Add system message if this is the first message
    if (this._messages.length === 0 && systemPrompt) {
      // Optionally add file context to system prompt
      const ctx = buildContext(maxLines);
      let fullSystemPrompt = systemPrompt;
      if (ctx) {
        fullSystemPrompt += formatContextForPrompt(ctx);
      }
      this._messages.push({ role: 'system', content: fullSystemPrompt });
    }

    // Build user message with optional images
    const userMessage: OllamaMessage = { role: 'user', content: userText };
    if (images.length > 0) {
      // Strip data URI prefix to get pure base64
      userMessage.images = images.map((img) => {
        const match = img.match(/^data:[^;]+;base64,(.+)$/);
        return match ? match[1] : img;
      });
    }
    this._messages.push(userMessage);

    // Show user message in webview (include image data URIs for display)
    this._view.webview.postMessage({
      type: 'addMessage',
      role: 'user',
      content: userText,
      images: images,  // full data URIs for display
    });

    // Start streaming response
    this._view.webview.postMessage({ type: 'startStreaming' });
    this._abortSignal = { aborted: false };
    this._updateStatusBar('$(loading~spin) 응답 중...', 'warning');

    let fullResponse = '';

    try {
      await this._ollamaClient.chatStream(
        this._currentModel,
        this._messages,
        // onToken
        (token: string) => {
          fullResponse += token;
          this._view?.webview.postMessage({
            type: 'streamToken',
            token,
          });
        },
        // onDone
        () => {
          this._messages.push({ role: 'assistant', content: fullResponse });
          this._view?.webview.postMessage({ type: 'endStreaming' });
          this._updateStatusBar(`$(check) ${this._currentModel}`, 'statusBarItem');
        },
        // onError
        (error: Error) => {
          this._view?.webview.postMessage({
            type: 'error',
            message: `오류: ${error.message}`,
          });
          this._updateStatusBar(`$(error) 연결 실패`, 'error');
        },
        this._abortSignal
      );
    } catch (err: any) {
      this._view.webview.postMessage({
        type: 'error',
        message: `Ollama 서버 연결 실패: ${err.message}\n\n💡 'ollama serve' 명령어로 서버를 시작해주세요.`,
      });
      this._updateStatusBar('$(error) Ollama 오프라인', 'error');
    }
  }

  /**
   * Open native file picker and send image to webview
   */
  private async _pickImageFile(): Promise<void> {
    const fileUris = await vscode.window.showOpenDialog({
      canSelectMany: true,
      filters: {
        'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'],
      },
      openLabel: '이미지 선택',
    });

    if (!fileUris || fileUris.length === 0) {return;}

    const images: string[] = [];
    for (const uri of fileUris) {
      try {
        const fileData = await vscode.workspace.fs.readFile(uri);
        const base64 = Buffer.from(fileData).toString('base64');
        // Detect MIME type from extension
        const ext = uri.fsPath.split('.').pop()?.toLowerCase() || 'png';
        const mimeMap: Record<string, string> = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
        };
        const mime = mimeMap[ext] || 'image/png';
        images.push(`data:${mime};base64,${base64}`);
      } catch (e: any) {
        vscode.window.showWarningMessage(`이미지 로드 실패: ${uri.fsPath}`);
      }
    }

    if (images.length > 0) {
      this._view?.webview.postMessage({
        type: 'imagesSelected',
        images,
      });
    }
  }

  /**
   * Switch model via QuickPick
   */
  public async _switchModel(): Promise<void> {
    try {
      const models = await this._ollamaClient.listModels();
      const items = models.map((m: any) => ({
        label: m.name,
        description: `${(m.size / 1e9).toFixed(1)} GB`,
        detail: m.name === this._currentModel ? '✅ 현재 사용 중' : '',
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '사용할 모델을 선택하세요',
      });

      if (selected) {
        this._currentModel = selected.label;
        this._updateStatusBar(`$(hubot) ${this._currentModel}`, 'statusBarItem');
        this._view?.webview.postMessage({
          type: 'modelChanged',
          model: this._currentModel,
        });
        vscode.window.showInformationMessage(`모델 전환: ${this._currentModel}`);
      }
    } catch {
      vscode.window.showErrorMessage('Ollama 서버에서 모델 목록을 가져올 수 없습니다.');
    }
  }

  /**
   * Clear chat history
   */
  public _clearChat(): void {
    this._messages = [];
    this._view?.webview.postMessage({ type: 'clearChat' });
  }

  /**
   * Insert code into active editor
   */
  private _insertCodeToEditor(code: string): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('코드를 삽입할 에디터가 열려있지 않습니다.');
      return;
    }

    editor.edit((editBuilder) => {
      if (editor.selection.isEmpty) {
        editBuilder.insert(editor.selection.active, code);
      } else {
        editBuilder.replace(editor.selection, code);
      }
    });
  }

  /**
   * Check Ollama connection and update status
   */
  private async _checkConnection(): Promise<void> {
    const alive = await this._ollamaClient.isAlive();
    if (alive) {
      this._updateStatusBar(`$(hubot) ${this._currentModel}`, 'statusBarItem');
      this._view?.webview.postMessage({ type: 'connectionStatus', connected: true });
    } else {
      this._updateStatusBar('$(error) Ollama 오프라인', 'error');
      this._view?.webview.postMessage({ type: 'connectionStatus', connected: false });
    }
  }

  /**
   * Send available models to webview
   */
  private async _sendModelsToWebview(): Promise<void> {
    try {
      const models = await this._ollamaClient.listModels();
      this._view?.webview.postMessage({
        type: 'modelList',
        models: models.map((m: any) => m.name),
        currentModel: this._currentModel,
      });
    } catch {
      // Server might not be available yet
    }
  }

  /**
   * Update status bar appearance
   */
  private _updateStatusBar(text: string, color: string): void {
    this._statusBarItem.text = text;
    if (color === 'error') {
      this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (color === 'warning') {
      this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this._statusBarItem.backgroundColor = undefined;
    }
  }

  /**
   * Generate the full HTML for the webview
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.js')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data: blob:;">
  <link href="${styleUri}" rel="stylesheet">
  <title>LUCA Offline Chat</title>
</head>
<body>
  <div id="app">
    <header id="header">
      <div class="header-left">
        <span class="header-icon">🤖</span>
        <span class="header-title">LUCA</span>
      </div>
      <div class="header-right">
        <select id="model-select" title="모델 선택"></select>
        <button id="btn-clear" title="대화 초기화">🗑️</button>
      </div>
    </header>

    <div id="connection-banner" class="banner hidden">
      <span>⚠️ Ollama 서버 연결 안됨 — <code>ollama serve</code> 실행 필요</span>
    </div>

    <div id="chat-messages">
      <div class="welcome-message">
        <div class="welcome-icon">🧑‍💻</div>
        <h3>LUCA Offline</h3>
        <p>인터넷 없이도 동작하는 멀티모달 로컬 AI 코딩 어시스턴트입니다.</p>
        <p class="hint">📷 이미지를 붙여넣기(Ctrl+V) 하거나 드래그해서 질문할 수 있어요</p>
        <p class="hint">⌨️ 코드를 선택 후 <kbd>Ctrl+Shift+L</kbd>로 질문할 수 있어요</p>
      </div>
    </div>

    <div id="input-area">
      <div id="stop-btn-container" class="hidden">
        <button id="btn-stop">■ 중단</button>
      </div>
      <div id="image-preview-bar" class="hidden"></div>
      <div class="input-wrapper">
        <div class="input-actions">
          <button id="btn-attach" title="이미지 첨부 (+)">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
            </svg>
          </button>
        </div>
        <textarea id="user-input" placeholder="메시지 입력... (이미지: 붙여넣기/드래그)" rows="1"></textarea>
        <button id="btn-send" title="전송">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 1.5L15 8L1 14.5V9.5L10 8L1 6.5V1.5Z"/>
          </svg>
        </button>
      </div>
    </div>
  </div>

  <div id="drop-overlay" class="hidden">
    <div class="drop-overlay-content">
      <div class="drop-icon">📷</div>
      <div>이미지를 여기에 놓으세요</div>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
