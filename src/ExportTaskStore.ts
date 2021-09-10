import {workspace, window, Uri} from "vscode";

import * as path from "path";
import { mkdirSync, PathLike, readdirSync, existsSync, copyFileSync } from "fs";


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


  async getAppID():Promise<string|undefined> {
    let value:string|undefined;
    if (workspace.workspaceFolders !== undefined) {
      const source = path.join(workspace.workspaceFolders[0].uri.fsPath, "apex");

      const getDirectories = (source: PathLike) =>
          readdirSync(source, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory() && dirent.name.toLowerCase().startsWith("f"))
          .map((dirent) => dirent.name);
      const apps = getDirectories(source);
      value = await window.showQuickPick(apps, { placeHolder: "Select Application to export" });

      value = value?.substring(1);
    }

    return value;
  }

  addApplication(appID: string) {
    if (workspace.workspaceFolders !== undefined) {

      const dirName:string = path.join(workspace.workspaceFolders[0].uri.fsPath, "apex/f" + appID);

      if (!existsSync(dirName)){
        mkdirSync(dirName, { recursive: true });

        window.showInformationMessage(`Folder: apex/f${appID} created. At next export you can export the application.`);
      }

      this.addStaticFolder(appID);
    }
  }

  addStaticFolder(appID: string) {
    if (workspace.workspaceFolders !== undefined) {

      const dirName:string = path.join(workspace.workspaceFolders[0].uri.fsPath, `static/f${appID}/src`);

      if (!existsSync(dirName)){
        mkdirSync(path.join(dirName, "js"), { recursive: true });
        mkdirSync(path.join(dirName, "css"));
        mkdirSync(path.join(dirName, "img"));

        window.showInformationMessage(`Folder: "static/f${appID}/src" created. Just place your JavaScript, CSS or any other file here, to build an upload`);
      }
    }
  }

  async getNewApplication(): Promise<string> {
     const value:string | undefined = await window.showInputBox({ prompt: "dbFlux add Application", placeHolder: "Enter APP-ID" });
     return value ? value : "";
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
