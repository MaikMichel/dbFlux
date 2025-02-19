import { ExtensionContext, window } from "vscode";
import { getDBFlowMode, IProjectInfos } from "../provider/AbstractBashTaskProvider";
import { getSchemaFromFile, getWorkspaceRootPath } from "../helper/utilities";



export class CompileTaskStore {
  private static _instance: CompileTaskStore;
  private _appPwd: string | undefined;
  private _adminPwd: string | undefined;
  private _adminUser: string | undefined;
  private _selectedSchemas: string[] | undefined;

  private _targetApplicationID: number | undefined;
  private _targetWorkspace: string | undefined;

  public get targetWorkspace(): string | undefined {
    return this._targetWorkspace;
  }
  public set targetWorkspace(value: string | undefined) {
    this._targetWorkspace = value;
  }

  public get targetApplicationID(): number | undefined {
    return this._targetApplicationID;
  }

  public set targetApplicationID(value: number |undefined) {
    this._targetApplicationID = value;
  }

  public get appPwd(): string | undefined {
    return this._appPwd;
  }
  public set appPwd(value: string | undefined) {
    this._appPwd = value;
  }

  public get adminPwd(): string | undefined {
    return this._adminPwd;
  }
  public set adminPwd(value: string | undefined) {
    this._adminPwd = value;
  }

  public get adminUser(): string | undefined {
    return this._adminUser;
  }
  public set adminUser(value: string | undefined) {
    this._adminUser = value;
  }

  public get selectedSchemas(): string[] | undefined {
    return this._selectedSchemas;
  }
  public set selectedSchemas(value: string[] | undefined) {
    this._selectedSchemas = value;
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
}

export async function setAdminUserName(projectInfosReloaded: IProjectInfos) {
  const compTaskStoreInstance = CompileTaskStore.getInstance();
  if (!projectInfosReloaded.dbAdminUser) {
    if (!compTaskStoreInstance.adminUser) {
      compTaskStoreInstance.adminUser = await window.showInputBox({ prompt: `dbFlux: Enter Admin user name for connection: ${projectInfosReloaded.dbTns}`, placeHolder: "admin" });
    } else {
      if (compTaskStoreInstance.adminUser?.length === 0) {
        compTaskStoreInstance.adminUser = undefined;
      }
    }
  } else {
    compTaskStoreInstance.adminUser = projectInfosReloaded.dbAdminUser;
  }
}

export async function setAdminPassword(projectInfosReloaded: IProjectInfos) {
  const compTaskStoreInstance = CompileTaskStore.getInstance();
  if (!projectInfosReloaded.dbAdminPwd) {
    if (!compTaskStoreInstance.adminPwd) {
      compTaskStoreInstance.adminPwd = await window.showInputBox({ prompt: `dbFlux: Enter Password for connection ${projectInfosReloaded.dbAdminUser}@${projectInfosReloaded.dbTns}`, placeHolder: "Password", password: true });
    } else {
      if (compTaskStoreInstance.adminPwd?.length === 0) {
        compTaskStoreInstance.adminPwd = undefined;
      }
    }
  } else {
    compTaskStoreInstance.adminPwd = projectInfosReloaded.dbAdminPwd;
  }
}

export async function setAppPassword(projectInfosReloaded: IProjectInfos, context: ExtensionContext | undefined = undefined, relativeFileName: string | undefined = undefined) {
  const compTaskStoreInstance = CompileTaskStore.getInstance();
  let schemaPWD:string|undefined = undefined;
  if (relativeFileName) {
     let schemaName = "";
     try {
      schemaName = getSchemaFromFile(relativeFileName, projectInfosReloaded.isFlexMode);
      if (getDBFlowMode(context!) === "dbFlux") {
        schemaPWD = await context?.secrets.get(getWorkspaceRootPath() + `|dbFlux_${schemaName}_PWD`)
      }
     } catch (e) {

     }
  }

  if (schemaPWD) {
    compTaskStoreInstance.appPwd = schemaPWD;
  } else {

    if (!projectInfosReloaded.dbAppPwd) {
      if (!compTaskStoreInstance.appPwd) {
        compTaskStoreInstance.appPwd = await window.showInputBox({ prompt: `dbFlux: Enter Password for connection ${projectInfosReloaded.dbAppUser}@${projectInfosReloaded.dbTns}`, placeHolder: "Password", password: true });
      } else {
        if (compTaskStoreInstance.appPwd?.length === 0) {
          compTaskStoreInstance.appPwd = undefined;
        }
      }
    } else {
      compTaskStoreInstance.appPwd = projectInfosReloaded.dbAppPwd;
    }
  }
}
