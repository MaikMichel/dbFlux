import fetch from 'node-fetch';
import { CancellationToken, commands, ExtensionContext, FileDecoration, FileDecorationProvider, Uri, workspace } from 'vscode';
import { Disposable, EventEmitter, ThemeColor, window } from 'vscode';
import { ConfigurationManager } from '../helper/ConfigurationManager';
import { outputLog } from '../helper/OutputChannel';
import { rtrim } from '../helper/utilities';
import { getProjectInfos, IProjectInfos } from './AbstractBashTaskProvider';

export class ViewFileDecorationProvider implements FileDecorationProvider, Disposable {
  private _onDidChangeFileDecorations = new EventEmitter<undefined>();
	readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;



  private readonly disposable: Disposable;

  context: ExtensionContext;
  cachedFiles:string[] = [];
  cachedUsers:string[] = [];
  osUser:string|undefined;

  constructor(context: ExtensionContext) {
    this.context = context;
    this.osUser = process.env.username?process.env.username:"none";
    this.disposable = Disposable.from(window.registerFileDecorationProvider(this));
  }

  dispose(): void {
    this.disposable.dispose();
  }

  async refreshCache() {
    const urlToFetch = rtrim(ConfigurationManager.getDBLockRESTUrl(), "/") + "/dblock/v1/files/" + getProjectInfos(this.context).projectName?.toLowerCase();
    const options = {
      method: 'GET',
      headers: {  Accept: '*/*',
                 'User-Agent': 'VSCode (dbFlux)',
                 'mandant': ConfigurationManager.getDBLockMandantToken()
          }
        };

    const response = await fetch(urlToFetch, options);
    const data = await response.json();
    this.cachedFiles = data.items.map(function (elem:any) {
      return elem.lfs_name
    });
    this.cachedUsers = data.items.map(function (elem:any) {
      return elem.lfs_user
    });

    this.updateDecorations();
  }

  updateDecorations() {
		this._onDidChangeFileDecorations.fire(undefined);
	}

  async provideFileDecoration(uri: Uri, token: CancellationToken): Promise<FileDecoration | undefined> {
    const relativePath = workspace.asRelativePath(uri);
    if (this.cachedFiles.indexOf(relativePath) > -1) {
      return this.provideCommitFileStatusDecoration(uri, token);
    }
    return undefined;
  }

  provideCommitFileStatusDecoration(uri: Uri, _token: CancellationToken): FileDecoration | undefined {
    const relativePath = workspace.asRelativePath(uri);
    const matchedIndex = this.cachedFiles.indexOf(relativePath);

    if (this.cachedUsers[matchedIndex] === this.osUser) {
      return {
        badge: '\u270E',
        color: new ThemeColor('dbFLow.lockedByYouFileBackground'),
        tooltip: 'dbFLow:locked by you',
      };
    } else {
      return {
        badge: '\uD83D\uDD12',
        color: new ThemeColor('dbFLow.lockedFileBackground'),
        tooltip: 'dbFLow:locked by ' + this.cachedUsers[matchedIndex],
      };
    }
  }
}


export function registerLockCurrentFileCommand(projectInfos: IProjectInfos, decoProvider: ViewFileDecorationProvider) {
  return commands.registerCommand("dbFlux.lockCurrentFile", async () => {

    console.log('window.activeTextEditor', window.activeTextEditor);
    if (window.activeTextEditor != undefined) {

      const relativeFile = workspace.asRelativePath(window.activeTextEditor.document.uri);
      console.log('relativeFile', relativeFile);
      const urlEncodedFile = encodeURIComponent(relativeFile!);
      const urlFromSettings = rtrim(ConfigurationManager.getDBLockRESTUrl(), "/");

      const url = `${urlFromSettings}/dblock/v1/file/${projectInfos.projectName?.toLowerCase()}?filename=${urlEncodedFile}`;

      const options = {
        method: 'POST',
        headers: {  Accept: '*/*',
                  'User-Agent': 'VSCode (dbFlux)',
                  'username': process.env.username?process.env.username:"none",
                  'mandant': ConfigurationManager.getDBLockMandantToken()
            }
      };

      console.log('url', url, options);
      const response = await fetch(url, options);
      console.log('response', response, response.body);

      if (response.ok) {
        const data = await response.json();

        window.showInformationMessage(`${data.message}`)
        decoProvider.refreshCache();
      } else {
        const text = response.text();
        console.log('text', text);

        outputLog(`Status from ${urlFromSettings} was ${response.status}`);
      }
    }
  }
)};


export function registerUnLockCurrentFileCommand(projectInfos: IProjectInfos, decoProvider: ViewFileDecorationProvider) {
  return commands.registerCommand("dbFlux.unlockCurrentFile", async () => {
    if (window.activeTextEditor) {
      const relativeFile = workspace.asRelativePath(window.activeTextEditor.document.uri);
      const urlEncodedFile = encodeURIComponent(relativeFile!);
      const urlFromSettings = rtrim(ConfigurationManager.getDBLockRESTUrl(), "/");

      const url = `${urlFromSettings}/dblock/v1/file/${projectInfos.projectName?.toLowerCase()}?filename=${urlEncodedFile}`;

      const options = {
        method: 'DELETE',
        headers: {  Accept: '*/*',
                   'User-Agent': 'VSCode (dbFlux)',
                   'mandant': ConfigurationManager.getDBLockMandantToken()
            }
          };


      const response = await fetch(url, options);
      if (response.ok) {
        const data = await response.json();

        window.showInformationMessage(`${data.message}`)
        decoProvider.refreshCache();
      } else {
        outputLog(`Status from ${urlFromSettings} was ${response.status}`);
      }
    }
  });
}

export function registerregisterRefreshLockedFiles(decoProvider: ViewFileDecorationProvider) {
  return commands.registerCommand("dbFlux.refreshLockedFiles", async () => {
        decoProvider.refreshCache();
    }
  );
}
