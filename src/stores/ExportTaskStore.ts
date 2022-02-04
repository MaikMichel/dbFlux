import {workspace, window, Uri, ExtensionContext, commands} from "vscode";

import * as path from "path";
import { mkdirSync, PathLike, readdirSync, existsSync, copyFileSync } from "fs";
import { IProjectInfos } from "../provider/AbstractBashTaskProvider";


export class ExportTaskStore {
  private static _instance: ExportTaskStore;
  private _expID: string|undefined;

  public get expID(): string|undefined{
    return this._expID;
  }
  public set expID(value: string|undefined) {
    this._expID = value;
  }

  private constructor()
  {
      //...
  }

  public static getInstance()
  {
      // Do you need arguments? Make it a regular static method instead.
      return this._instance || (this._instance = new this());
  }


  async getAppID(projectInfos:IProjectInfos):Promise<string|undefined> {
    let value:string|undefined;
    if (workspace.workspaceFolders !== undefined) {
      const rootPath = workspace.workspaceFolders[0].uri.fsPath;
      const source = path.join(rootPath, "apex");
      // const reg = /^\d{2}_/;

      // Neu
      const getSchemaFolders = (source: PathLike) =>
          readdirSync(source, { withFileTypes: true })
          .filter((dirent) => {
            return dirent.isDirectory();
          })
          .map((dirent) => dirent.name);

      const getWorkspaces = (source: PathLike, subFolders:string[]):string[] => {
        let folders:string[] = [];

        subFolders.forEach(folder => {
          const folderPath = path.join(source.toString(), folder);
             const workspaces =
               readdirSync(folderPath, { withFileTypes: true })
                .filter((dirent) => {
                  return dirent.isDirectory();
                })
                .map((dirent) => {
                  return folderPath + path.sep + dirent.name;
                });
              folders = folders.concat(workspaces);
        });


         return folders;
      };

      const getApplications = (workspaceFolder:string[]):string[] => {
        let apps:string[] = [];

        workspaceFolder.forEach(wsPath => {

             const localApps =
               readdirSync(wsPath, { withFileTypes: true })
                .filter((dirent) => {
                  return dirent.isDirectory() && dirent.name.toLowerCase().startsWith("f");
                })
                .map((dirent) => {
                  // return relative Path to app
                  return path.join(wsPath, dirent.name).replace(rootPath + path.sep, "").replace(/\\/g, '/');
                });

              apps = apps.concat(localApps);
        });

        return apps;
      };


      const apps = projectInfos.isFlexMode ? getApplications(getWorkspaces(source, getSchemaFolders(source))):getApplications([source]);
      value = await window.showQuickPick(apps, { placeHolder: "Select Application to export" });

      // value = value?.substring(1);
    }

    return value;
  }





  addReportTypeFolder(folderType: string) {
    if (workspace.workspaceFolders !== undefined) {

      const dirName:string = path.join(workspace.workspaceFolders[0].uri.fsPath, `reports/${folderType}`);

      if (!existsSync(dirName)){
        mkdirSync(dirName, { recursive: true });

        copyFileSync(path.resolve(__dirname, "..", "dist", "template.sql"), path.resolve(dirName+'/template.sql'));

        let openPath = Uri.file(dirName+'/template.sql');
        workspace.openTextDocument(openPath).then(doc => {
          window.showTextDocument(doc);
        });

        window.showInformationMessage(`Folder: "reports/${folderType}" created. Sample template.sql file written`);
      }
    }
  }

  async getReportType(): Promise<string> {
    const value:string | undefined = await window.showInputBox({ prompt: "dbFlux add Report Type", placeHolder: "Enter type name" });
    return value ? value : "";
  }

}
