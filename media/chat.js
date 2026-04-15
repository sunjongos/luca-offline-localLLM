// @ts-nocheck
(function () {
  const vscode = acquireVsCodeApi();

  // DOM elements
  const chatMessages = document.getElementById('chat-messages');
  const userInput = document.getElementById('user-input');
  const btnSend = document.getElementById('btn-send');
  const btnClear = document.getElementById('btn-clear');
  const btnStop = document.getElementById('btn-stop');
  const stopContainer = document.getElementById('stop-btn-container');
  const modelSelect = document.getElementById('model-select');
  const connectionBanner = document.getElementById('connection-banner');

  let isStreaming = false;
  let currentStreamEl = null;
  let streamBuffer = '';
  let welcomeShown = true;

  // ===== Initialize =====
  vscode.postMessage({ type: 'ready' });

  // ===== Event Listeners =====
  btnSend.addEventListener('click', sendMessage);
  btnClear.addEventListener('click', () => vscode.postMessage({ type: 'clearChat' }));
  btnStop.addEventListener('click', () => vscode.postMessage({ type: 'stopGeneration' }));

  modelSelect.addEventListener('change', () => {
    vscode.postMessage({ type: 'switchModel', model: modelSelect.value });
  });

  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
  });

  // ===== Message Handling =====
  function sendMessage() {
    const text = userInput.value.trim();
    if (!text || isStreaming) return;

    vscode.postMessage({ type: 'sendMessage', text });
    userInput.value = '';
    userInput.style.height = 'auto';
  }

  // ===== Receive messages from extension =====
  window.addEventListener('message', (event) => {
    const data = event.data;

    switch (data.type) {
      case 'addMessage':
        removeWelcome();
        addMessageEl(data.role, data.content);
        break;

      case 'startStreaming':
        isStreaming = true;
        btnSend.disabled = true;
        stopContainer.classList.remove('hidden');
        streamBuffer = '';
        currentStreamEl = createStreamingEl();
        break;

      case 'streamToken':
        streamBuffer += data.token;
        if (currentStreamEl) {
          renderMarkdown(currentStreamEl.querySelector('.message-content'), streamBuffer, true);
        }
        scrollToBottom();
        break;

      case 'endStreaming':
        isStreaming = false;
        btnSend.disabled = false;
        stopContainer.classList.add('hidden');
        if (currentStreamEl) {
          renderMarkdown(currentStreamEl.querySelector('.message-content'), streamBuffer, false);
          currentStreamEl = null;
        }
        streamBuffer = '';
        scrollToBottom();
        break;

      case 'error':
        isStreaming = false;
        btnSend.disabled = false;
        stopContainer.classList.add('hidden');
        if (currentStreamEl) {
          currentStreamEl.remove();
          currentStreamEl = null;
        }
        addErrorEl(data.message);
        streamBuffer = '';
        break;

      case 'clearChat':
        chatMessages.innerHTML = '';
        showWelcome();
        break;

      case 'modelList':
        populateModelSelect(data.models, data.currentModel);
        break;

      case 'modelChanged':
        modelSelect.value = data.model;
        break;

      case 'connectionStatus':
        if (data.connected) {
          connectionBanner.classList.add('hidden');
        } else {
          connectionBanner.classList.remove('hidden');
        }
        break;
    }
  });

  // ===== DOM Helpers =====
  function removeWelcome() {
    if (welcomeShown) {
      const w = chatMessages.querySelector('.welcome-message');
      if (w) w.remove();
      welcomeShown = false;
    }
  }

  function showWelcome() {
    welcomeShown = true;
    chatMessages.innerHTML = `
      <div class="welcome-message">
        <div class="welcome-icon">🧑‍💻</div>
        <h3>Luca Offline</h3>
        <p>인터넷 없이도 동작하는 로컬 AI 코딩 어시스턴트입니다.</p>
        <p class="hint">코드를 선택 후 <kbd>Ctrl+Shift+L</kbd>로 질문할 수 있어요</p>
      </div>`;
  }

  function addMessageEl(role, content) {
    const el = document.createElement('div');
    el.className = `message ${role}`;
    const roleLabel = role === 'user' ? '👤 나' : '🤖 인턴';
    el.innerHTML = `
      <div class="message-role">${roleLabel}</div>
      <div class="message-content"></div>`;
    renderMarkdown(el.querySelector('.message-content'), content, false);
    chatMessages.appendChild(el);
    scrollToBottom();
  }

  function createStreamingEl() {
    removeWelcome();
    const el = document.createElement('div');
    el.className = 'message assistant';
    el.innerHTML = `
      <div class="message-role">🤖 인턴</div>
      <div class="message-content streaming-cursor"></div>`;
    chatMessages.appendChild(el);
    scrollToBottom();
    return el;
  }

  function addErrorEl(message) {
    removeWelcome();
    const el = document.createElement('div');
    el.className = 'message error';
    el.innerHTML = `
      <div class="message-role">⚠️ 오류</div>
      <div class="message-content">${escapeHtml(message)}</div>`;
    chatMessages.appendChild(el);
    scrollToBottom();
  }

  function populateModelSelect(models, current) {
    modelSelect.innerHTML = '';
    models.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === current) opt.selected = true;
      modelSelect.appendChild(opt);
    });
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  }

  // ===== Markdown Renderer (Lightweight, no deps) =====
  function renderMarkdown(container, text, isStreaming) {
    if (!container) return;

    // Remove streaming cursor while re-rendering
    container.classList.toggle('streaming-cursor', isStreaming);

    let html = '';
    const lines = text.split('\n');
    let inCodeBlock = false;
    let codeBlockLang = '';
    let codeBlockContent = '';
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code block start/end
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockLang = line.slice(3).trim() || 'text';
          codeBlockContent = '';
          if (inList) { html += '</ul>'; inList = false; }
        } else {
          inCodeBlock = false;
          html += renderCodeBlock(codeBlockLang, codeBlockContent);
          codeBlockLang = '';
          codeBlockContent = '';
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent += (codeBlockContent ? '\n' : '') + line;
        continue;
      }

      // Headers
      if (line.startsWith('### ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<h3>${inlineFormat(line.slice(4))}</h3>`;
      } else if (line.startsWith('## ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<h2>${inlineFormat(line.slice(3))}</h2>`;
      } else if (line.startsWith('# ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<h1>${inlineFormat(line.slice(2))}</h1>`;
      }
      // Unordered list
      else if (/^[\-\*] /.test(line)) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += `<li>${inlineFormat(line.slice(2))}</li>`;
      }
      // Ordered list
      else if (/^\d+\. /.test(line)) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += `<li>${inlineFormat(line.replace(/^\d+\. /, ''))}</li>`;
      }
      // Empty line
      else if (line.trim() === '') {
        if (inList) { html += '</ul>'; inList = false; }
      }
      // Normal paragraph
      else {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<p>${inlineFormat(line)}</p>`;
      }
    }

    // Handle unclosed code blocks (during streaming)
    if (inCodeBlock) {
      html += renderCodeBlock(codeBlockLang, codeBlockContent, true);
    }
    if (inList) {
      html += '</ul>';
    }

    container.innerHTML = html;

    // Bind code action buttons
    container.querySelectorAll('.btn-copy-code').forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = decodeURIComponent(btn.dataset.code);
        navigator.clipboard.writeText(code).then(() => {
          btn.textContent = '✓ 복사됨';
          setTimeout(() => (btn.textContent = '📋 복사'), 1500);
        });
      });
    });

    container.querySelectorAll('.btn-insert-code').forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = decodeURIComponent(btn.dataset.code);
        vscode.postMessage({ type: 'insertCode', code });
        btn.textContent = '✓ 삽입됨';
        setTimeout(() => (btn.textContent = '📥 삽입'), 1500);
      });
    });
  }

  function renderCodeBlock(lang, code, partial) {
    const encoded = encodeURIComponent(code);
    const escapedCode = escapeHtml(code);
    const actions = partial
      ? ''
      : `<div class="code-block-actions">
           <button class="btn-copy-code" data-code="${encoded}">📋 복사</button>
           <button class="btn-insert-code" data-code="${encoded}">📥 삽입</button>
         </div>`;

    return `<div class="code-block-wrapper">
      <div class="code-block-header">
        <span>${lang}</span>
        ${actions}
      </div>
      <div class="code-block-content">${escapedCode}</div>
    </div>`;
  }

  function inlineFormat(text) {
    let s = escapeHtml(text);
    // Bold
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Inline code
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" title="$2">$1</a>');
    return s;
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
