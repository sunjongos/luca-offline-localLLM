import * as vscode from 'vscode';
import { ChatViewProvider } from './chatViewProvider';

let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  console.log('[Luca Offline] Extension activated');

  // Status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'luca-offline.switchModel';
  statusBarItem.text = '$(hubot) gemma4:e4b';
  statusBarItem.tooltip = 'Luca Offline — 클릭하여 모델 전환';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Chat view provider
  const chatProvider = new ChatViewProvider(context.extensionUri, statusBarItem);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      chatProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('luca-offline.openChat', () => {
      vscode.commands.executeCommand('luca-offline.chatView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('luca-offline.askAboutSelection', () => {
      chatProvider.askAboutSelection();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('luca-offline.switchModel', () => {
      chatProvider._switchModel();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('luca-offline.clearChat', () => {
      chatProvider._clearChat();
    })
  );

  // Listen for config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('lucaOffline')) {
        vscode.window.showInformationMessage('Luca Offline 설정이 변경되었습니다. 채팅을 초기화합니다.');
        chatProvider._clearChat();
      }
    })
  );
}

export function deactivate() {
  console.log('[Luca Offline] Extension deactivated');
}
