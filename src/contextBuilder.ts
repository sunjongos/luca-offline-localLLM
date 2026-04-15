import * as vscode from 'vscode';

export interface CodeContext {
  fileName: string;
  language: string;
  fullContent: string;
  selectedText: string;
  cursorLine: number;
  workspaceFolder: string;
}

/**
 * Build a context string from the current editor state
 */
export function buildContext(maxLines: number = 200): CodeContext | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return null;
  }

  const document = editor.document;
  const selection = editor.selection;

  // Get selected text or surrounding code
  let selectedText = '';
  if (!selection.isEmpty) {
    selectedText = document.getText(selection);
  }

  // Get file content (limited by maxLines)
  const totalLines = document.lineCount;
  let fullContent = '';
  if (totalLines <= maxLines) {
    fullContent = document.getText();
  } else {
    // Center around cursor
    const cursorLine = editor.selection.active.line;
    const halfWindow = Math.floor(maxLines / 2);
    const startLine = Math.max(0, cursorLine - halfWindow);
    const endLine = Math.min(totalLines - 1, startLine + maxLines);
    const range = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
    fullContent = `[... 라인 ${startLine + 1}-${endLine + 1} / 전체 ${totalLines} 라인 ...]\n` + document.getText(range);
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.name || '';

  return {
    fileName: document.fileName.replace(/\\/g, '/').split('/').pop() || '',
    language: document.languageId,
    fullContent,
    selectedText,
    cursorLine: editor.selection.active.line + 1,
    workspaceFolder,
  };
}

/**
 * Format context into a system-prompt-friendly string
 */
export function formatContextForPrompt(ctx: CodeContext): string {
  let prompt = `\n[현재 파일 컨텍스트]\n`;
  prompt += `- 파일명: ${ctx.fileName}\n`;
  prompt += `- 언어: ${ctx.language}\n`;
  prompt += `- 커서 위치: ${ctx.cursorLine}번째 줄\n`;
  if (ctx.workspaceFolder) {
    prompt += `- 워크스페이스: ${ctx.workspaceFolder}\n`;
  }

  if (ctx.selectedText) {
    prompt += `\n[선택된 코드]\n\`\`\`${ctx.language}\n${ctx.selectedText}\n\`\`\`\n`;
  }

  prompt += `\n[파일 내용]\n\`\`\`${ctx.language}\n${ctx.fullContent}\n\`\`\`\n`;

  return prompt;
}
