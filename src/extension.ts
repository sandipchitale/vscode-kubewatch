import * as vscode from 'vscode';

import { KubeWatchDocumentContentProvider } from './KubeWatchDocumentContentProvider';

export function activate({ subscriptions }: vscode.ExtensionContext) {
  // register a content provider for the kube-watch
  const kubeWatchSchemeProvider = new KubeWatchDocumentContentProvider();
  subscriptions.push(kubeWatchSchemeProvider);
  subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      KubeWatchDocumentContentProvider.KUBE_WATCH,
      kubeWatchSchemeProvider
    )
  );

  // register a command that opens kube watch buffer
  subscriptions.push(
    vscode.commands.registerCommand(
      'vscode-kubewatch.show',
      () => {
        kubeWatchSchemeProvider.open(KubeWatchDocumentContentProvider.KUBE_WATCH);
      }
    )
  );

  subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      'vscode-kubewatch.edit-kubeconfig',
      (editor) => {
        kubeWatchSchemeProvider.editKubeConfig();
      }
    )
  );

  subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      'vscode-kubewatch.copy-name',
      (editor) => {
        kubeWatchSchemeProvider.copyName(editor);
      }
    )
  );

  subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      'vscode-kubewatch.quit',
      (editor) => {
        kubeWatchSchemeProvider.quit();
      }
    )
  );

  subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      'vscode-kubewatch.reload',
      (editor) => {
        kubeWatchSchemeProvider.reload();
      }
    )
  );

  subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      'vscode-kubewatch.settings',
      (editor) => {
        kubeWatchSchemeProvider.settings();
      }
    )
  );

  subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      'vscode-kubewatch.switch-namespace',
      (editor) => {
        kubeWatchSchemeProvider.switchNamespace();
      }
    )
  );

  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('vscode-kubewatch.resourceTypes')) {
      kubeWatchSchemeProvider.reload();
    }
  });

  subscriptions.push(
    vscode.languages.registerHoverProvider(KubeWatchDocumentContentProvider.KUBE_WATCH, {
      provideHover(document, position, token): Thenable<vscode.Hover> {
        return new Promise<vscode.Hover>((resolve, reject) => {
          (async () => {
            resolve(new vscode.Hover(await kubeWatchSchemeProvider.hover(document, position)));
          })();
        });
      }
    })
  );

}
