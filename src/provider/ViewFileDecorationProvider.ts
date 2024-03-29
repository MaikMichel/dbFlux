import fetch from 'node-fetch';
import { CancellationToken, commands, ExtensionContext, FileDecoration, FileDecorationProvider, Uri, workspace } from 'vscode';
import { Disposable, EventEmitter, ThemeColor, window } from 'vscode';
import { ConfigurationManager } from '../helper/ConfigurationManager';

import { rtrim } from '../helper/utilities';
import { getProjectInfos, IProjectInfos } from './AbstractBashTaskProvider';
import { homedir } from 'os';
import { basename } from 'path';
import { LoggingService } from '../helper/LoggingService';

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
    this.osUser = process.env.username?process.env.username:basename(homedir());
    this.disposable = Disposable.from(window.registerFileDecorationProvider(this));
  }

  dispose(): void {
    this.disposable.dispose();
  }

  public getCachedFiles(): string[] {
    return this.cachedFiles;
  }

  public getCachedUsers(): string[] {
    return this.cachedUsers;
  }

  async refreshCache() {
    if (ConfigurationManager.getDBLockRESTUrl()) {
      try {
        const urlToFetch = rtrim(ConfigurationManager.getDBLockRESTUrl(), "/") + "/dblock/v1/files/" + (await getProjectInfos(this.context)).projectName?.toLowerCase();
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

      } catch (e:any) {
        LoggingService.logError(`Error while trying to fetch`, e);
        await window.showErrorMessage(`dbFlux (dbLock): ${e}!`);
      }
    } else {
      LoggingService.logError(`No REST-URL provided. Please adjust your settings!`);
      await window.showErrorMessage(`dbFlux: No REST-URL provided. Please adjust your settings!`);
    }
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


    if (window.activeTextEditor != undefined) {

      const relativeFile = workspace.asRelativePath(window.activeTextEditor.document.uri);
      LoggingService.logInfo(`locking file ${relativeFile}`);
      const urlEncodedFile = encodeURIComponent(relativeFile!);
      const urlFromSettings = rtrim(ConfigurationManager.getDBLockRESTUrl(), "/");

      if (ConfigurationManager.getDBLockRESTUrl()) {


        const url = `${urlFromSettings}/dblock/v1/file/${projectInfos.projectName?.toLowerCase()}?filename=${urlEncodedFile}`;
        LoggingService.logDebug(`send request ${url}`);
        const options = {
          method: 'POST',
          headers: {  Accept: '*/*',
                    'User-Agent': 'VSCode (dbFlux)',
                    'username': process.env.USERNAME?process.env.USERNAME:basename(homedir()),
                    'mandant': ConfigurationManager.getDBLockMandantToken()
              }
        };

        try {
          const response = await fetch(url, options);

          if (response.ok) {
            const data = await response.json();

            window.showInformationMessage(`${data.message}`)
            decoProvider.refreshCache();
            await commands.executeCommand('dbflux.dblock.treeview.view_refresh');
          } else {
            LoggingService.logInfo(`Status from ${urlFromSettings} was ${response.status}`);
          }
        } catch (e:any) {
          LoggingService.logError(`dbFlux (dbLock): ${e}!`, e);
          await window.showErrorMessage(`dbFlux (dbLock): ${e}!`);
        }
      } else {
        LoggingService.logError(`No REST-URL provided. Please adjust your settings!`);
        await window.showErrorMessage(`dbFlux: No REST-URL provided. Please adjust your settings!`);
      }
    }
  }
)};


export function registerUnLockCurrentFileCommand(projectInfos: IProjectInfos, decoProvider: ViewFileDecorationProvider) {
  return commands.registerCommand("dbFlux.unlockCurrentFile", async () => {
    if (window.activeTextEditor) {
      const relativeFile = workspace.asRelativePath(window.activeTextEditor.document.uri);
      const urlEncodedFile = encodeURIComponent(relativeFile!);

      if (ConfigurationManager.getDBLockRESTUrl()) {
        const urlFromSettings = rtrim(ConfigurationManager.getDBLockRESTUrl(), "/");

        const url = `${urlFromSettings}/dblock/v1/file/${projectInfos.projectName?.toLowerCase()}?filename=${urlEncodedFile}`;

        const options = {
          method: 'DELETE',
          headers: {  Accept: '*/*',
                    'User-Agent': 'VSCode (dbFlux)',
                    'mandant': ConfigurationManager.getDBLockMandantToken()
              }
            };

        try {
          const response = await fetch(url, options);
          if (response.ok) {
            const data = await response.json();

            window.showInformationMessage(`${data.message}`)
            decoProvider.refreshCache();
            await commands.executeCommand('dbflux.dblock.treeview.view_refresh');
          } else {
            LoggingService.logInfo(`Status from ${urlFromSettings} was ${response.status}`);
          }
        } catch (e:any) {
          console.error(e);
          await window.showErrorMessage(`dbFlux (dbLock): ${e}!`);
        }
      } else {
        LoggingService.logError(`No REST-URL provided. Please adjust your settings!`);
        await window.showErrorMessage(`dbFlux: No REST-URL provided. Please adjust your settings!`);
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
