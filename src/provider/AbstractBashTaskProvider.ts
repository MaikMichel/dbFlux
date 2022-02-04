import * as path from "path";
import * as dotenv from "dotenv";
import { chmodSync, existsSync, PathLike, readdirSync, readFileSync } from "fs";
import { getWorkspaceRootPath, matchRuleShort } from "../helper/utilities";
import * as yaml from 'yaml';
import { CompileTaskStore } from "../stores/CompileTaskStore";
import { outputLog } from "../helper/OutputChannel";
import { commands, ExtensionContext, QuickPickItem, Uri, window, workspace } from "vscode";

export interface IBashInfos {
  runFile:        string;
  connectionTns:  string;
  connectionUser: string;
  connectionPass: string;
  cwd:            string;
  projectInfos:   IProjectInfos;
}

export interface IProjectInfos {
  projectName: string|undefined;
  appSchema: string;
  logicSchema: string;
  dataSchema: string;
  dbAppUser: string;
  dbAppPwd: string|undefined;
  dbAdminUser: string|undefined;
  dbAdminPwd: string|undefined;
  dbTns: string;
  isValid: boolean;
  isFlexMode: boolean;
}

export abstract class AbstractBashTaskProvider {
  context: ExtensionContext;

  constructor(context: ExtensionContext) {
    this.context = context;
  }

  static dbFluxType: string = "dbFlux";
  /* eslint-disable */
  static CONN_DATA:  string = "DATA";
  static CONN_LOGIC: string = "LOGIC";
  static CONN_APP:   string = "APP";
  /* eslint-enable  */

  findClosestEnvFile(pathname: string, filename: string): string | undefined {
    let file = path.join(pathname, filename);
    let filePath = pathname;

    if (workspace.workspaceFolders !== undefined) {
      const wsf = workspace.workspaceFolders[0].uri.fsPath;
      let i = 0;

      while ((i < 10 || file.indexOf(wsf) > 0) && !existsSync(file)) {
        i++;
        const folders = filePath.split(path.posix.sep);
        folders.pop();
        filePath = folders.join(path.posix.sep);
        file = path.join(filePath, filename);
      }
    } else {
      throw new Error("not workspacefolder opened");
    }

    if (!existsSync(file)) {
      throw new Error(filename + " not found");
    }

    return file;
  }




  buildConnectionUser(projectInfos: IProjectInfos, currentPath: string): string {
    let dbSchemaFolder = getDBUserFromPath(currentPath, projectInfos);

    if (dbSchemaFolder === "_setup") {
      return projectInfos.dbAdminUser+"".toLowerCase();
    } else {
      if (projectInfos.dbAppUser.toLowerCase() === dbSchemaFolder) {
        return `${projectInfos.dbAppUser}`;
      } else {
        return `${projectInfos.dbAppUser}[${dbSchemaFolder}]`;
      }
    }
  }

  getConnection(projectInfos: IProjectInfos, currentPath: string): string {
    return this.buildConnectionUser(projectInfos, currentPath) + `/${projectInfos.dbAppPwd}@${projectInfos.dbTns}`;
  }


   setInitialCompileInfo(execFileName:string, fileUri: Uri, runnerInfo:IBashInfos):void {
    let projectInfos: IProjectInfos = getProjectInfos(this.context);
    const activeFile = fileUri.fsPath.split(path.sep).join(path.posix.sep);

    runnerInfo.runFile  = path.resolve(__dirname, "..", "..", "dist", execFileName).split(path.sep).join(path.posix.sep);
    if (existsSync(runnerInfo.runFile)) {
      chmodSync(runnerInfo.runFile, 0o755);
    }
    runnerInfo.cwd      = path.dirname(activeFile);

    runnerInfo.connectionTns  = projectInfos.dbTns;
    runnerInfo.connectionUser = this.buildConnectionUser(projectInfos, runnerInfo.cwd);
    runnerInfo.connectionPass = runnerInfo.connectionUser === projectInfos.dbAdminUser ? CompileTaskStore.getInstance().adminPwd! : CompileTaskStore.getInstance().appPwd!;
    runnerInfo.projectInfos   = projectInfos;

    if (matchRuleShort(runnerInfo.connectionPass, "${*}") ||
        matchRuleShort(runnerInfo.connectionUser, "${*}") ||
        matchRuleShort(runnerInfo.connectionPass, "${*}")) {
      window.showErrorMessage("dbFlux: Sourcing or parameters not supported");
      throw new Error("dbFlux: Sourcing or parameters not supported");
    }
  }

  getConnectionType(conn: string, compInfos: IBashInfos):string{
    if (matchRuleShort(conn, `${compInfos.projectInfos.dbAppUser}[${compInfos.projectInfos.dataSchema}]/*`)) {
      return AbstractBashTaskProvider.CONN_DATA;
    } else if (matchRuleShort(conn, `${compInfos.projectInfos.dbAppUser}[${compInfos.projectInfos.logicSchema}]/*`)) {
      return AbstractBashTaskProvider.CONN_LOGIC;
    } else {
      return AbstractBashTaskProvider.CONN_APP;
    }
  }
}

export function getProjectInfos(context: ExtensionContext) {
  let projectInfos: IProjectInfos = {} as IProjectInfos;
  if (getDBFlowMode(context) === "dbFlux") {
    projectInfos = getProjectInfosFromDBFlux(context);
  } else if (getDBFlowMode(context) === "dbFlow") {
    projectInfos = getProjectInfosFromDBFlow();
  } else if (getDBFlowMode(context) === "xcl") {
    projectInfos = getProjectInfosFromXCL();
  }
  return projectInfos;
}

export function getDBFlowMode(context: ExtensionContext):string | undefined {
  let retValue: string | undefined = undefined;
  if (workspace.workspaceFolders !== undefined) {
    const workspaceFolder = workspace.workspaceFolders[0].uri.fsPath;
    const knownBuildFiles = ["xcl.yml", "build.env"];

    for (let buildFileName of knownBuildFiles) {
      const buildFile = path.join(workspaceFolder, buildFileName);
      if (existsSync(buildFile)) {
        retValue = buildFileName === "build.env" ? "dbFlow" : "xcl";
        break;
      }
    };


    if (retValue === undefined) {
      retValue = context.workspaceState.get("dbFlux_mode");
    }
  }

  return retValue;
}

export function applyFileExists(pMode:string) {
  return workspace.workspaceFolders
       && existsSync(path.join(workspace.workspaceFolders[0].uri.fsPath, pMode === "dbFlow"?"apply.env":".xcl/env.yml"));
}


function getProjectInfosFromDBFlow():IProjectInfos {
  const projectInfos: IProjectInfos = {} as IProjectInfos;
  if (workspace.workspaceFolders !== undefined) {
    const f = workspace.workspaceFolders[0].uri.fsPath;

    const applyEnv = dotenv.config({ path: path.join(f, "apply.env")});
    const buildEnv = dotenv.config({ path: path.join(f, "build.env")});

    if (applyEnv.parsed) {
      projectInfos.dbAppUser   = applyEnv.parsed.DB_APP_USER;
      projectInfos.dbAppPwd    = applyEnv.parsed.DB_APP_PWD;
      projectInfos.dbAdminUser = applyEnv.parsed.DB_ADMIN_USER;
      projectInfos.dbAdminPwd  = applyEnv.parsed.DB_ADMIN_PWD;
      projectInfos.dbTns       = applyEnv.parsed.DB_TNS;
    }

    if (buildEnv.parsed) {
      projectInfos.appSchema    = buildEnv.parsed.APP_SCHEMA;
      projectInfos.logicSchema  = buildEnv.parsed.LOGIC_SCHEMA;
      projectInfos.dataSchema   = buildEnv.parsed.DATA_SCHEMA;

      projectInfos.isFlexMode  = (buildEnv.parsed.FLEX_MODE?.toUpperCase() === "TRUE");
      projectInfos.projectName = buildEnv.parsed.PROJECT;
    }
  }

  validateProjectInfos(projectInfos);

  return projectInfos;
}

function getProjectInfosFromDBFlux(context: ExtensionContext):IProjectInfos {
  const projectInfos: IProjectInfos = {} as IProjectInfos;
  if (workspace.workspaceFolders !== undefined) {

      projectInfos.dbAppUser   = context.workspaceState.get("dbFlux_DB_APP_USER")!;
      projectInfos.dbAppPwd    = context.workspaceState.get("dbFlux_DB_APP_PWD");
      projectInfos.dbAdminUser = context.workspaceState.get("dbFlux_DB_ADMIN_USER");
      projectInfos.dbAdminPwd  = context.workspaceState.get("dbFlux_DB_ADMIN_PWD");
      projectInfos.dbTns       = context.workspaceState.get("dbFlux_DB_TNS")!;

      projectInfos.appSchema    = context.workspaceState.get("dbFlux_APP_SCHEMA")!;
      projectInfos.logicSchema  = context.workspaceState.get("dbFlux_LOGIC_SCHEMA")!;
      projectInfos.dataSchema   = context.workspaceState.get("dbFlux_DATA_SCHEMA")!;


      projectInfos.isFlexMode   = context.workspaceState.get("dbFlux_FLEX_MODE") === true;
      projectInfos.projectName  = context.workspaceState.get("dbFlux_PROJECT");

  }

  validateProjectInfos(projectInfos);

  return projectInfos;
}

function getProjectInfosFromXCL():IProjectInfos {
  const projectInfos: IProjectInfos = {} as IProjectInfos;
  if (workspace.workspaceFolders !== undefined) {
    const f = workspace.workspaceFolders[0].uri.fsPath;

    const buildYml = yaml.parse(readFileSync(path.join(f, "xcl.yml")).toString());

    if (buildYml) {
      projectInfos.appSchema    = buildYml.xcl.users.schema_app;
      projectInfos.logicSchema  = buildYml.xcl.users.schema_logic?buildYml.xcl.users.schema_logic:projectInfos.appSchema;
      projectInfos.dataSchema   = buildYml.xcl.users.schema_data?buildYml.xcl.users.schema_data:projectInfos.appSchema;

      projectInfos.isFlexMode   = (buildYml.xcl.users.flex_mod === true);
      projectInfos.projectName  = buildYml.xcl.project;
    }

    if (existsSync(path.join(f, `.xcl/env.yml`))) {
      const applyYml = yaml.parse(readFileSync(path.join(f, `.xcl/env.yml`)).toString());

      if (applyYml) {
        projectInfos.dbAppUser = buildYml.xcl.users.user_deployment;
        projectInfos.dbTns     = applyYml.connection;
        projectInfos.dbAppPwd  = applyYml.password;
      }
    } else {
      outputLog('.xcl/env.yml not found');
    }
  }

  validateProjectInfos(projectInfos);

  return projectInfos;
}

async function validateProjectInfos(projectInfos: IProjectInfos) {
  let dbConnMsg = "";
  let schemaMsg = "";

  if (
      (projectInfos.dbAppUser === undefined || !projectInfos.dbAppUser || projectInfos.dbAppUser.length === 0) ||
      (projectInfos.dbTns === undefined || !projectInfos.dbTns || projectInfos.dbTns?.length === 0)
  ) {
    dbConnMsg = `Connection configuration incomplete! Please check your configuration!
    (User: ${projectInfos.dbAppUser},
    Connection: ${projectInfos.dbTns})
    `;
    window.setStatusBarMessage("$(testing-error-icon) dbFlux > Connection configuration incomplete!");
    setTimeout(function(){
      window.setStatusBarMessage("");
    }, 4000);

    window.showErrorMessage(dbConnMsg, "Open configuration").then(selection => {
      if (selection) {
        commands.executeCommand("dbFlux.showConfig");
      }
    });
  }

  if (!projectInfos.isFlexMode && (
    (projectInfos.appSchema === undefined || !projectInfos.appSchema || projectInfos.appSchema.length === 0) ||
    (projectInfos.logicSchema === undefined || !projectInfos.logicSchema || projectInfos.logicSchema.length === 0) ||
    (projectInfos.dataSchema === undefined || !projectInfos.dataSchema || projectInfos.dataSchema.length === 0)
  )) {
    schemaMsg = `Schema configuration incomplete! Please check your configuration!
    (DATA: ${projectInfos.dataSchema},
    LOGIC: ${projectInfos.logicSchema},
    APP: ${projectInfos.appSchema})
    `;

    window.setStatusBarMessage("$(testing-error-icon) dbFlux > Schema configuration incomplete!");
    setTimeout(function(){
      window.setStatusBarMessage("");
    }, 4000);

    window.showErrorMessage(schemaMsg, "Open configuration").then(selection => {

      if (selection) {
        commands.executeCommand("dbFlux.showConfig");
      }
    });
  }

  if ((dbConnMsg.length + schemaMsg.length) > 0) {
    outputLog(dbConnMsg);
    outputLog(schemaMsg);
    // throw new Error("Project configuration is invalid");
    projectInfos.isValid = false;
  } else {
    projectInfos.isValid = true;
  }

}


export function getDBUserFromPath(pathName: string, projectInfos: IProjectInfos): string {
  let returnDBUser: string = ""; // sql File inside static or rest
  const wsRoot = getWorkspaceRootPath().toLowerCase()+path.posix.sep;
  const lowerPathName = pathName.toLowerCase().replace(wsRoot, "");
  const lowerPathParts = lowerPathName.split(path.posix.sep);




  if (lowerPathParts[0] === "db") {
    returnDBUser = lowerPathParts[1];
  } else if (["apex", "rest"].includes(lowerPathParts[0])) {
    if (projectInfos.isFlexMode) {
      returnDBUser = lowerPathParts[1];
    } else {
      returnDBUser = projectInfos.appSchema.toLowerCase();
    }
  } else {

    if (projectInfos.appSchema) {
      returnDBUser = projectInfos.appSchema.toLowerCase();
    }
  }

  return returnDBUser;
}

export async function getDBSchemaFolders():Promise<QuickPickItem[]> {
  if (workspace.workspaceFolders){
      const wsRoot = workspace.workspaceFolders[0].uri.fsPath;
      const sourceDB = path.join(wsRoot, "db");

      const getSchemaFolders = (source: PathLike) =>
      readdirSync(source, { withFileTypes: true })
      .filter((dirent) => {
        return dirent.isDirectory() && !["_setup", "sys", "dist", ".hooks"].includes(dirent.name);
      })
      .map((dirent) => dirent.name);

      return getSchemaFolders(sourceDB).map(function(element){return {"label":element, "description":"db/"+element , "alwaysShow": true};});

  }
  return [{label: "", description:""}];
}