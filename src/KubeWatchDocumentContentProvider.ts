import * as vscode from "vscode";
import * as k8s from 'vscode-kubernetes-tools-api';
import { TextDocument, TextEditor } from 'vscode';

export class KubeWatchDocumentContentProvider implements vscode.TextDocumentContentProvider {
  private visible = false;

  private rawKubeWatchBuffer = '';

  private kubectlApi: k8s.KubectlV1 | undefined = undefined;
  private configurationApi: k8s.ConfigurationV1 | undefined = undefined;
  // private explorerApi: k8s.ClusterExplorerV1 | undefined = undefined;

  static readonly KUBE_WATCH = 'kube-watch'

  // emitter and its event
  onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  onDidChange = this.onDidChangeEmitter.event;

  private uri: vscode.Uri | undefined = undefined;

  private kubeWatchTextDocument: undefined | TextDocument;
  private kubeWatchTextEditor: undefined | TextEditor;

  private refreshIntervalInSeconds = 15;

  constructor() {
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.uri.scheme === KubeWatchDocumentContentProvider.KUBE_WATCH) {
        editor.options = {
          cursorStyle: vscode.TextEditorCursorStyle.BlockOutline,
        };
        vscode.commands.executeCommand('setContext', 'vscode-kubewatch', true);
        // this.reload();
      } else {
        vscode.commands.executeCommand('setContext', 'vscode-kubewatch', false);
      }
    });

    (async () => {
      const kubectl = await k8s.extension.kubectl.v1;
      if (!kubectl.available) {
          vscode.window.showErrorMessage(`kubectl not available.`);
          return;
      } else {
        this.kubectlApi = kubectl.api;
      }

      const configuration = await k8s.extension.configuration.v1_1;
      if (configuration.available) {
        this.configurationApi = configuration.api;
        configuration.api.onDidChangeKubeconfigPath((kubeconfigPath) => {
          // current context is changed, do something with it
          setTimeout(() => {
            this.reload();
          }, 1000);
        });
        configuration.api.onDidChangeContext((context) => {
          // current context is changed, do something with it
          setTimeout(() => {
            this.reload();
          }, 1000);
        });
        configuration.api.onDidChangeNamespace((namespace) => {
          // current namespace is changed, do something with it
          setTimeout(() => {
            this.reload();
          }, 1000);
        });
      }
    })();
  }

  provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    return this.buffer(uri);
  }

  dispose(): any {
    this.kubeWatchTextDocument = undefined;
    this.kubeWatchTextEditor = undefined;

    this.onDidChangeEmitter.dispose();
  }

  async buffer(uri: vscode.Uri): Promise<string> {
    this.uri = uri;
    return new Promise((resolve, reject) => {
      (async () => {
        if (this.kubectlApi) {
          let versions = '';
          const versionsShellResult = await this.kubectlApi.invokeCommand('version --short');
          if (versionsShellResult) {
            // if (versionsShellResult.stdout && versionsShellResult.stdout.length > 0) {
            if (versionsShellResult.code === 0) {
              versions = versionsShellResult.stdout.split(/\r?\n/g).join(' ').trim();
            }
          }

          let kubeconfigPath = '';
          if (this.configurationApi) {
            const kubeconfigPathObject = this.configurationApi.getKubeconfigPath();
            if (kubeconfigPathObject.pathType === 'host') {
              kubeconfigPath = kubeconfigPathObject.hostPath;
            } else {
              kubeconfigPath = kubeconfigPathObject.wslPath;
            }
          }

          let context = '';
          const contextShellResult = await this.kubectlApi.invokeCommand('config current-context');
          if (contextShellResult) {
            if (contextShellResult.code === 0) {
              context = contextShellResult.stdout.split(/\r?\n/g).join('');
            }
          }

          let namespace = '';
          const namespaceShellResult = await this.kubectlApi.invokeCommand('config view --minify --output "jsonpath={..namespace}"');
          if (namespaceShellResult) {
            if (namespaceShellResult.code === 0) {
              namespace = namespaceShellResult.stdout.split(/\r?\n/g).join('');
            }
          }

          const refreshIntervalInSeconds = vscode.workspace.getConfiguration('vscode-kubewatch').get('refreshIntervalInSeconds');
          if (refreshIntervalInSeconds === undefined || refreshIntervalInSeconds === null) {
            //
          } else {
            this.refreshIntervalInSeconds = refreshIntervalInSeconds as number;
          }

          const resourceTypes = ((vscode.workspace.getConfiguration('vscode-kubewatch').get('resourceTypes') || ['pods']) as []).join(',');
          let fromNamespace = vscode.workspace.getConfiguration('vscode-kubewatch').get('namespace') || '';
          if (fromNamespace === '-A' || fromNamespace === '') {
            //
          } else {
            fromNamespace = `-n ${fromNamespace}`;
          }
          const getOptions = vscode.workspace.getConfiguration('vscode-kubewatch').get('get-options') || '';
          const apiResourcesShellResult = await this.kubectlApi.invokeCommand(`get ${resourceTypes} ${fromNamespace} ${getOptions}`);
          if (apiResourcesShellResult) {
            if (apiResourcesShellResult.stdout && apiResourcesShellResult.stdout.length > 0) {
              this.rawKubeWatchBuffer =
                `Kubeconfig: ${kubeconfigPath}\nContext: ${context} Namespace: ${namespace} ${versions} ( Hover for help )\n\nget ${resourceTypes} ${fromNamespace} ${getOptions}\n\n${apiResourcesShellResult.stdout}`;
              if (this.refreshIntervalInSeconds > 0) {
                setTimeout(() => {
                  this.reload();
                }, this.refreshIntervalInSeconds * 1000);
              }
              resolve(this.rawKubeWatchBuffer);
            } else if (apiResourcesShellResult.stderr && apiResourcesShellResult.stderr.length > 0) {
              this.rawKubeWatchBuffer =
                `Kubeconfig: ${kubeconfigPath}\nContext: ${context} Namespace: ${namespace} ${versions} ( Hover for help )\n\nget ${resourceTypes} ${fromNamespace} ${getOptions}\n\n${apiResourcesShellResult.stderr}`;
              resolve(this.rawKubeWatchBuffer);
            } else {
              reject(apiResourcesShellResult.stderr);
            }
          } else {
              reject('resources not available');
          }
        } else {
          reject('kubectl not available');
        }
      })();
    });
  }

  open(dir: string) {
    this.visible = true;
    this.rawKubeWatchBuffer = '';
    if (this.kubeWatchTextDocument) {
      vscode.window.showTextDocument(this.kubeWatchTextDocument, { preview: false }).then(() => {
        vscode.commands.executeCommand("workbench.action.closeActiveEditor").then(async () => {
          this._open(dir);
        });
      });
    } else {
      this._open(dir);
    }
  }

  private async _open(dir: string) {
    const uri = vscode.Uri.parse(`${KubeWatchDocumentContentProvider.KUBE_WATCH}:///${dir}`);
    this.kubeWatchTextDocument = await vscode.workspace.openTextDocument(uri);
    vscode.languages.setTextDocumentLanguage(this.kubeWatchTextDocument, KubeWatchDocumentContentProvider.KUBE_WATCH);
    this.kubeWatchTextEditor = await vscode.window.showTextDocument(this.kubeWatchTextDocument, { preview: false });
    this.kubeWatchTextEditor.options.insertSpaces = false;
    this.kubeWatchTextEditor.options.tabSize = 0;
    this._goto(6);
  }

  async editKubeConfig() {
    let kubeconfigPath = '';
    if (this.configurationApi) {
      const kubeconfigPathObject = this.configurationApi.getKubeconfigPath();
      if (kubeconfigPathObject.pathType === 'host') {
        kubeconfigPath = kubeconfigPathObject.hostPath;
      } else {
        kubeconfigPath = kubeconfigPathObject.wslPath;
      }
      const kubeConfigTextDocument = await vscode.workspace.openTextDocument(kubeconfigPath);
      vscode.languages.setTextDocumentLanguage(kubeConfigTextDocument, 'yaml');
      const kubeConfigTextEditor = await vscode.window.showTextDocument(kubeConfigTextDocument, { preview: false });
    }
  }

  async copyName(editor: vscode.TextEditor) {
    const lineNumber = editor.selection.start.line;
    const lineCount = editor.document.lineCount;
    if (lineNumber > 1 && lineNumber < lineCount - 1) {
      const lineText = this.kubeWatchTextDocument?.lineAt(lineNumber).text;
      if (lineText) {
        const lineTextParts = lineText?.split(/\s+/);
        const fromNamespace = vscode.workspace.getConfiguration('vscode-kubewatch').get('namespace') || '';
        if (fromNamespace === '-A') {
          if (lineTextParts && lineTextParts.length > 1) {
            vscode.env.clipboard.writeText(lineTextParts[1].replace(/[^/]+\//, ''));
          }
        } else {
          if (lineTextParts && lineTextParts.length > 0) {
            vscode.env.clipboard.writeText(lineTextParts[0].replace(/[^/]+\//, ''));
          }
        }
      }
    }
  }

  async switchNamespace() {
    const namespacesShellResult = await this.kubectlApi?.invokeCommand(`get namespaces --no-headers -o custom-columns=":metadata.name"`);
    if (namespacesShellResult) {
      if (namespacesShellResult.code === 0) {
        const namespaces = namespacesShellResult.stdout.split(/\r?\n/g).filter(line => line.trim().length > 0);
        const selectedNamespace = await vscode.window.showQuickPick(namespaces);
        if (selectedNamespace) {
          const switchNamespaceShellResult = await this.kubectlApi?.invokeCommand(`config set-context --current --namespace=${selectedNamespace}`); //
          if (switchNamespaceShellResult && switchNamespaceShellResult.code === 0) {
            this.reload();
            try {
              await vscode.commands.executeCommand('extension.vsKubernetesRefreshExplorer');
            } catch (e) {
              //
            }
          }
        }
      }
    }
  }

  next(lineNumber: number) {
    this._goto(lineNumber+1);
  }

  previous(lineNumber: number) {
    this._goto(lineNumber-1);
  }

  private _goto(lineNumber: number) {
    this.kubeWatchTextEditor!.selection = new vscode.Selection(lineNumber, 0, lineNumber, 0);
  }

  settings() {
    vscode.commands.executeCommand('workbench.action.openSettings', `@ext:sandipchitale.vscode-kubewatch`);
  }

  reload() {
    if (this.visible) {
      this.rawKubeWatchBuffer = '';
      this.refresh();
    }
  }

  refresh() {
    this.onDidChangeEmitter.fire(this.uri as vscode.Uri);
  }

  quit() {
    vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    this.visible = false;
  }

  async hover(document: vscode.TextDocument, position: vscode.Position) {
    return new Promise<vscode.MarkdownString>((resolve, reject) => {
      (async () => {
        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`
# Configuration

- Specified [Resources types](https://kubernetes.io/docs/reference/kubectl/overview/#resource-types) to show from namespace:
  - current
  - specific or
  - all namespaces
- [Format](https://kubernetes.io/docs/reference/kubectl/overview/#formatting-output)
- Auto refresh interval in seconds (0 disables auto refresh)

# Keybindings

|Keybinding|Command|
|---|---|
|\`\`\`c\`\`\`|Edit Kube Config|
|\`\`\`n\`\`\`|Copy name|
|\`\`\`q\`\`\`|Quit|
|\`\`\`F5\`\`\`|Reload|
|\`\`\`w\`\`\`|Switch namespace|
|\`\`\`CTRL+,\`\`\`|Show settings for this extension|`
        );
          resolve(markdown);
          return;
      })();
    });
  }
}
