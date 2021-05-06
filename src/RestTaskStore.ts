import {workspace, window} from "vscode";
import * as path from "path";
import { PathLike, readdirSync, mkdirSync, existsSync } from "fs";

export class RestTaskStore {
  private static _instance: RestTaskStore;
  private _restModul: string = "";

  public get restModule(): string {
    return this._restModul;
  }
  public set restModule(value: string) {
    this._restModul = value;
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


  async getRestModule():Promise<string> {
    if (workspace.workspaceFolders !== undefined) {
      const source = path.join(workspace.workspaceFolders[0].uri.fsPath, "rest/modules");

      const getDirectories = (source: PathLike) =>
          readdirSync(source, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory() )
          .map((dirent) => dirent.name);
      const modules = getDirectories(source);
      const value = await window.showQuickPick(modules, { placeHolder: "Select Application to export" });

      return value!;
    } else {
      return "";
    }
  }


  addRestModul(modulName: string) {
    //
    if (workspace.workspaceFolders !== undefined) {

      const dirName:string = path.join(workspace.workspaceFolders[0].uri.fsPath, "rest/modules/" + modulName);

      if (!existsSync(dirName)){
        mkdirSync(dirName);

        window.showInformationMessage(`Folder: rest/modules/${modulName} created. At next export you can export the module.`);
      }


    }
  }

  async getNewRestModule(): Promise<string> {
     const value:string | undefined = await window.showInputBox({ prompt: "dbFlow add REST Modul", placeHolder: "Enter module name" });
     return value ? value : "";
  }

}