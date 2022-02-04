import {workspace, window } from "vscode";
import * as path from "path";
import { PathLike, readdirSync, existsSync } from "fs";
import { IProjectInfos } from "../provider/AbstractBashTaskProvider";

export class RestTaskStore {
  private static _instance: RestTaskStore;
  private _restModul: string|undefined;

  public get restModule(): string|undefined {
    return this._restModul;
  }
  public set restModule(value: string|undefined) {
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


  async getRestModule(projectInfos:IProjectInfos):Promise<string|undefined> {
    let value:string|undefined;
    if (workspace.workspaceFolders !== undefined) {
      const rootPath = workspace.workspaceFolders[0].uri.fsPath;
      const source = path.join(rootPath, "rest");

      const getSubFolders = (source: PathLike) =>
          readdirSync(source, { withFileTypes: true })
          .filter((dirent) => {
            return dirent.isDirectory();
          })
          .map((dirent) => path.join(source.toString(), dirent.name));

      const getModules = (schemaFolder:string[]):string[] => {
        let apps:string[] = [];

        schemaFolder.forEach(wsPath => {
          const wsModPath = path.join(wsPath, "modules");
          if (existsSync(wsModPath)){
            const localApps = readdirSync(wsModPath, { withFileTypes: true })
                              .filter((dirent) => {
                                return dirent.isDirectory();
                              })
                              .map((dirent) => {
                                // return relative Path to app
                                return path.join(wsModPath, dirent.name).replace(rootPath + path.sep, "").replace(/\\/g, '/');
                              });

            apps = apps.concat(localApps);
          }
        });

        return apps;
      };

      const modules = projectInfos.isFlexMode ? getModules(getSubFolders(source)) : getModules([source]);
      value = await window.showQuickPick(modules, { placeHolder: "Select Module to export" });
    }

    return value;
  }
}
