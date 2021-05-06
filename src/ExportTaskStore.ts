import {workspace, window} from "vscode";
import * as path from "path";
import { mkdirSync, PathLike, readdirSync, existsSync } from "fs";

export class ExportTaskStore {
  private static _instance: ExportTaskStore;
  private _expID: string = "";

  public get expID(): string {
    return this._expID;
  }
  public set expID(value: string) {
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


  async getAppID():Promise<string> {
    if (workspace.workspaceFolders !== undefined) {
      const source = path.join(workspace.workspaceFolders[0].uri.fsPath, "apex");

      const getDirectories = (source: PathLike) =>
          readdirSync(source, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory() && dirent.name.toLowerCase().startsWith("f"))
          .map((dirent) => dirent.name);
      const apps = getDirectories(source);
      const value = await window.showQuickPick(apps, { placeHolder: "Select Application to export" });

      return value?.substring(1) + "";
    } else {
      return "";
    }
  }

  addApplication(appID: string) {
    //
    if (workspace.workspaceFolders !== undefined) {

      const dirName:string = path.join(workspace.workspaceFolders[0].uri.fsPath, "apex/f" + appID);

      if (!existsSync(dirName)){
        mkdirSync(dirName);

        window.showInformationMessage(`Folder: apex/f${appID} created. At next export you can export the application.`);
      }


    }
  }

  async getNewApplication(): Promise<string> {
     const value:string | undefined = await window.showInputBox({ prompt: "dbFlow add Application", placeHolder: "Enter APP-ID" });
     return value ? value : "";
  }

}