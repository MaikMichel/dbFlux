import * as path from "path";
import * as dotenv from "dotenv";
import { chmodSync, existsSync, PathLike, readdirSync, readFileSync } from "fs";
import { getPassword, getWorkspaceRootPath, matchRuleShort } from "../helper/utilities";
import * as yaml from 'yaml';
import { CompileTaskStore } from "../stores/CompileTaskStore";
import { commands, ExtensionContext, QuickPickItem, Uri, window, workspace } from "vscode";
import { ConfigurationManager } from "../helper/ConfigurationManager";
import { LoggingService } from "../helper/LoggingService";

export interface IBashInfos {
  runFile:        string;
  connectionTns:  string;
  connectionUser: string;
  connectionPass: string;
  cwd:            string;
  projectInfos:   IProjectInfos;
  coloredOutput:  string;
}

export interface IProjectInfos {
  projectName: string|undefined;
  projectMode: string|undefined;
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
  workspace: string|undefined;
  dbPasses: any|undefined;
}

export abstract class AbstractBashTaskProvider {
  context: ExtensionContext;
  dbFluxMode: string;

  constructor(context: ExtensionContext) {
    this.context = context;
    this.dbFluxMode = getDBFlowMode(context)!;
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
      LoggingService.logError(`not workspacefolder opened`);
      throw new Error("not workspacefolder opened");
    }

    if (!existsSync(file)) {
      LoggingService.logError(`${filename} not found`);
      throw new Error(`${filename} not found`);
    }

    return file;
  }


  buildConnectionUser(projectInfos: IProjectInfos, currentPath: string, currentFilePath: string | undefined = undefined): string {
    return buildConnectionUser(projectInfos, currentPath, currentFilePath);
  }



  getConnection(projectInfos: IProjectInfos, currentPath: string, useDefaultPW: boolean ): string {
    const connUser = this.buildConnectionUser(projectInfos, currentPath);
    const connPass = getPassword(projectInfos, connUser, useDefaultPW, this.context);
    return connUser + `/"${connPass}"@${projectInfos.dbTns}`;
  }



   async setInitialCompileInfo(execFileName:string, fileUri: Uri, runnerInfo:IBashInfos):Promise<void> {
    let projectInfos: IProjectInfos = await getProjectInfos(this.context);
    const activeFile = fileUri.fsPath.split(path.sep).join(path.posix.sep);


    runnerInfo.runFile  = path.resolve(__dirname, "..", "..", "dist", "shell", execFileName).split(path.sep).join(path.posix.sep);
    if (existsSync(runnerInfo.runFile)) {
      chmodSync(runnerInfo.runFile, 0o755);
    }
    runnerInfo.cwd      = path.dirname(activeFile);

    runnerInfo.connectionTns  = projectInfos.dbTns;
    runnerInfo.connectionUser = this.buildConnectionUser(projectInfos, runnerInfo.cwd, fileUri.path);
    runnerInfo.connectionPass = getPassword(projectInfos, runnerInfo.connectionUser, false, this.context);

    runnerInfo.projectInfos   = projectInfos;
    runnerInfo.coloredOutput  = "" + ConfigurationManager.getShowWarningsAndErrorsWithColoredOutput();

    if (matchRuleShort(runnerInfo.connectionPass, "${*}") ||
        matchRuleShort(runnerInfo.connectionUser, "${*}") ||
        matchRuleShort(runnerInfo.connectionPass, "${*}")) {
      window.showErrorMessage("dbFlux: Sourcing or parameters not supported");
      throw new Error("dbFlux: Sourcing or parameters not supported");
    }
  }

}

export function buildConnectionUser(projectInfos: IProjectInfos, currentPath: string, currentFilePath: string | undefined = undefined): string {
  let dbUserFromPath = getDBUserFromPath(currentPath, projectInfos, currentFilePath);

  if (dbUserFromPath.toLowerCase() === projectInfos.dbAdminUser+"".toLowerCase()) {
    return projectInfos.dbAdminUser+"".toLowerCase();
  } else {
    // check if there is a var with pattern: dbFlux_..._PWD,
    if (projectInfos.dbPasses?.hasOwnProperty(`dbFlux_${dbUserFromPath}_PWD`)) {
      return `${dbUserFromPath}`;
    } else {
      // otherwise as usual
      if (projectInfos.dbAppUser.toLowerCase() === dbUserFromPath.toLowerCase()) {
        return `${projectInfos.dbAppUser}`;
      } else {
        return `${projectInfos.dbAppUser}[${dbUserFromPath}]`;
      }
    }
  }
}

export async function getProjectInfos(context: ExtensionContext) {
  let projectInfos: IProjectInfos = {} as IProjectInfos;
  if (getDBFlowMode(context) === "dbFlux") {
    projectInfos = await getProjectInfosFromDBFlux(context);
  } else if (getDBFlowMode(context) === "dbFlow") {
    projectInfos = await getProjectInfosFromDBFlow(context);
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


async function getProjectInfosFromDBFlow(context: ExtensionContext):Promise<IProjectInfos> {
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

      // decode when starting with an !
      if (projectInfos.dbAppPwd && projectInfos.dbAppPwd.startsWith("!")) {
        projectInfos.dbAppPwd = Buffer.from(projectInfos.dbAppPwd.substring(1), 'base64').toString('utf8').replace("\n", "");
      }
      // decode when starting with an !
      if (projectInfos.dbAdminPwd && projectInfos.dbAdminPwd.startsWith("!")) {
        projectInfos.dbAdminPwd = Buffer.from(projectInfos.dbAdminPwd.substring(1), 'base64').toString('utf8').replace("\n", "");
      }

      // get all keys with pattern dbFlux_..._PWD and store them in array
      const filteredKeys = context.workspaceState.keys().filter(key => key.startsWith("dbFlux_") && key.endsWith("_PWD")); // dbFlux as prefix because this is a dbFlux feature (not dbFlow)

      for (const key of filteredKeys) {
        LoggingService.logInfo('Custom Schemapassword found: ' + key);
        projectInfos.dbPasses = projectInfos.dbPasses || {};
        projectInfos.dbPasses[key]    = await context.secrets.get(getWorkspaceRootPath()+"|" + key )+"";
      }
    }

    if (buildEnv.parsed) {
      projectInfos.projectName = buildEnv.parsed.PROJECT;
      projectInfos.projectMode  = buildEnv.parsed.PROJECT_MODE;

      projectInfos.appSchema    = buildEnv.parsed.APP_SCHEMA;
      projectInfos.logicSchema  = buildEnv.parsed.LOGIC_SCHEMA;
      projectInfos.dataSchema   = buildEnv.parsed.DATA_SCHEMA;

      projectInfos.isFlexMode  = (buildEnv.parsed.PROJECT_MODE?.toUpperCase() === "FLEX");
      projectInfos.workspace   = buildEnv.parsed.WORKSPACE;
    }
  }

  validateProjectInfos(projectInfos);

  return projectInfos;
}

async function getProjectInfosFromDBFlux(context: ExtensionContext):Promise<IProjectInfos> {
  const projectInfos: IProjectInfos = {} as IProjectInfos;
  if (workspace.workspaceFolders !== undefined) {

      projectInfos.dbAppUser   = context.workspaceState.get("dbFlux_DB_APP_USER")!;
      projectInfos.dbAppPwd    = await context.secrets.get(getWorkspaceRootPath()+"|dbFlux_DB_APP_PWD")+"";
      projectInfos.dbAdminUser = context.workspaceState.get("dbFlux_DB_ADMIN_USER");
      projectInfos.dbAdminPwd  = context.workspaceState.get("dbFlux_DB_ADMIN_PWD");
      projectInfos.dbTns       = context.workspaceState.get("dbFlux_DB_TNS")!;

      projectInfos.appSchema    = context.workspaceState.get("dbFlux_APP_SCHEMA")!;
      projectInfos.logicSchema  = context.workspaceState.get("dbFlux_LOGIC_SCHEMA")!;
      projectInfos.dataSchema   = context.workspaceState.get("dbFlux_DATA_SCHEMA")!;


      projectInfos.isFlexMode   = context.workspaceState.get("dbFlux_PROJECT_MODE") === "FLEX";
      projectInfos.projectName  = context.workspaceState.get("dbFlux_PROJECT");
      projectInfos.projectMode  = context.workspaceState.get("dbFlux_PROJECT_MODE");
      projectInfos.workspace    = context.workspaceState.get("dbFlux_WORKSPACE");

      // get all keys with pattern dbFlux_..._PWD and store them in array
      const filteredKeys = context.workspaceState.keys().filter(key => key.startsWith("dbFlux_") && key.endsWith("_PWD"));

      for (const key of filteredKeys) {
        LoggingService.logInfo('Custom Schemapassword found: ' + key);
        projectInfos.dbPasses = projectInfos.dbPasses || {};
        projectInfos.dbPasses[key]    = await context.secrets.get(getWorkspaceRootPath()+"|" + key )+"";
      }

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
      LoggingService.logWarning('.xcl/env.yml not found');
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
    dbConnMsg = `dbFlux: Connection configuration incomplete! Please check your configuration!
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

  if (!projectInfos.isFlexMode) {

    if ((projectInfos.projectMode === "MULTI") && (
          (projectInfos.appSchema === undefined || !projectInfos.appSchema || projectInfos.appSchema.length === 0) ||
          (projectInfos.logicSchema === undefined || !projectInfos.logicSchema || projectInfos.logicSchema.length === 0) ||
          (projectInfos.dataSchema === undefined || !projectInfos.dataSchema || projectInfos.dataSchema.length === 0)
        )) {
          schemaMsg = `dbFlux: Schema configuration incomplete! Please check your configuration!
          (DATA: ${projectInfos.dataSchema},
          LOGIC: ${projectInfos.logicSchema},
          APP: ${projectInfos.appSchema})`;
    } else if ((projectInfos.projectMode === "SINGLE") && (
      (projectInfos.appSchema === undefined || !projectInfos.appSchema || projectInfos.appSchema.length === 0)
    )) {
      schemaMsg = `dbFlux: Schema configuration incomplete! Please check your configuration!
      (APP: ${projectInfos.appSchema})`;
    }

    if (schemaMsg !== "") {
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
  }

  if ((dbConnMsg.length + schemaMsg.length) > 0) {
    LoggingService.logInfo(dbConnMsg);
    LoggingService.logInfo(schemaMsg);
    // throw new Error("Project configuration is invalid");
    projectInfos.isValid = false;
  } else {
    projectInfos.isValid = true;
  }

}

function isNumeric(str:string):boolean {
  let check = !isNaN(+str);
  return check;
}

export function getDBUserFromPath(pathName: string, projectInfos: IProjectInfos, currentFilePath: string | undefined = undefined): string {
  let returnDBUser: string = ""; // sql File inside static or rest
  const wsRoot = getWorkspaceRootPath().toLowerCase()+path.posix.sep;
  const lowerPathName = (pathName+"/").toLowerCase().replace(wsRoot, "");
  const lowerPathParts = lowerPathName.split(path.posix.sep);

  LoggingService.logDebug(`get DB User from Path`);

  if (currentFilePath !== undefined &&(lowerPathParts[0] === ".hooks" || (lowerPathParts[0] === ConfigurationManager.getDBFolderName() && lowerPathParts[1] === ".hooks"))) {
    const lastElement = currentFilePath.split("/").pop();
    // check if any db schema folder is inside this file
    getSchemaFolders(path.join(wsRoot, ConfigurationManager.getDBFolderName())).forEach((val)=>{
      if (lastElement!.indexOf(val) > 0) {
        returnDBUser = val;
      }
    });

    // when not matched exit with error
    if (returnDBUser.length === 0 ) {
      if (CompileTaskStore.getInstance().selectedSchemas) {
        returnDBUser = CompileTaskStore.getInstance().selectedSchemas![0].split('/')[1]; // db/dings
        window.showWarningMessage("You are compiling a hook-file. Keep in mind that the target schema-name must be a part of the filename. Otherwise dbFlow won't run this file!");
      } else {
        const errorMessage = "dbFlux: Unknown schema, please use *_schema_name_*.sql to execute a hook file";
        LoggingService.logError(errorMessage);
        window.showErrorMessage(errorMessage);
      }

    }

  } else if (lowerPathParts[0] === ConfigurationManager.getDBFolderName() && (lowerPathParts[1] === "_setup" || lowerPathParts[1] === ".setup")) {
    returnDBUser = projectInfos.dbAdminUser!;
  } else if (lowerPathParts[0] === ConfigurationManager.getDBFolderName()) {
    returnDBUser = lowerPathParts[1];
  } else if (["apex", "rest", "static", "plugin"].includes(lowerPathParts[0])) {
    if (projectInfos.isFlexMode) {
      returnDBUser = lowerPathParts[1];
    } else {
      returnDBUser = projectInfos.appSchema.toLowerCase();
    }
  } else {
    if (CompileTaskStore.getInstance().selectedSchemas) {
      returnDBUser = CompileTaskStore.getInstance().selectedSchemas![0].split('/')[1]; // db/dings
    } else {
      console.error('CompileTaskStore.getInstance().selectedSchemas', CompileTaskStore.getInstance().selectedSchemas);
    }
  }
  returnDBUser = returnDBUser?returnDBUser:"";


  if (returnDBUser && (lowerPathParts[0] !== "_setup" && lowerPathParts[0] !== ".setup") && returnDBUser.split("_").length > 1) {
    returnDBUser = isNumeric(returnDBUser.split("_")[0])?returnDBUser.split("_").slice(1).join("_"):returnDBUser;
  }

  LoggingService.logDebug(`returning returnDBUser: ${returnDBUser}`);
  return returnDBUser;
}

export const getSchemaFolders = (source: PathLike) =>
readdirSync(source, { withFileTypes: true })
.filter((dirent) => {
  return dirent.isDirectory() && !["_setup", ".setup", "sys", "dist", ".hooks"].includes(dirent.name);
})
.map((dirent) => dirent.name);

export async function getDBSchemaFolders():Promise<QuickPickItem[]> {
  if (workspace.workspaceFolders){
      const wsRoot = workspace.workspaceFolders[0].uri.fsPath;
      const sourceDB = path.join(wsRoot, ConfigurationManager.getDBFolderName());

      return getSchemaFolders(sourceDB).map(function(element){return {"label":element, "description":ConfigurationManager.getDBFolderName()+"/"+element , "alwaysShow": true};});

  }
  return [{label: "", description:""}];
}