import * as path from "path";
import * as vscode from "vscode";
import * as fs from "fs";
import * as dotenv from "dotenv";
import { existsSync } from "fs";
import { matchRuleShort } from "./utilities";
import * as yaml from 'yaml';
import * as os from 'os';
import { CompileTaskStore } from "./CompileTaskStore";
import { outputLog } from "./OutputChannel";

export interface IBashInfos {
  runFile:        string;
  connectionTns:  string;
  connectionUser: string;
  connectionPass: string;
  cwd:            string;
  projectInfos:   IProjectInfos;
}

interface IProjectInfos {
  appSchema: string;
  logicSchema: string;
  dataSchema: string;
  useProxy: boolean;
  dbAppUser: string;
  dbAppPwd: string|undefined;
  dbAdminUser: string|undefined;
  dbAdminPwd: string|undefined;
  dbTns: string;
  isValid: boolean;

}

export abstract class AbstractBashTaskProvider {
  context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
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

    if (vscode.workspace.workspaceFolders !== undefined) {
      const wsf = vscode.workspace.workspaceFolders[0].uri.fsPath;
      let i = 0;

      while ((i < 10 || file.indexOf(wsf) > 0) && !fs.existsSync(file)) {
        i++;
        const folders = filePath.split(path.posix.sep);
        folders.pop();
        filePath = folders.join(path.posix.sep);
        file = path.join(filePath, filename);
      }
    } else {
      throw new Error("not workspacefolder opened");
    }

    if (!fs.existsSync(file)) {
      throw new Error(filename + " not found");
    }

    return file;
  }


  getDBUserFromPath(pathName: string, projectInfos: IProjectInfos): string {
    let returnDBUser: string|undefined = projectInfos.appSchema.toLowerCase(); // sql File inside static or rest

    if (pathName.includes("db" + path.posix.sep + projectInfos.dataSchema.toLowerCase())) {
      returnDBUser = projectInfos.dataSchema.toLowerCase();
    } else if (pathName.includes("db" + path.posix.sep + projectInfos.logicSchema.toLowerCase())) {
      returnDBUser = projectInfos.logicSchema.toLowerCase();
    } else if (  pathName.includes("db" + path.posix.sep + projectInfos.appSchema.toLowerCase())
              || pathName.includes("apex" + path.posix.sep + "f")
              || pathName.includes("rest" + path.posix.sep + "modules")) {
      returnDBUser = projectInfos.appSchema.toLowerCase();
    }
    return returnDBUser;
  }

  buildConnectionUser(projectInfos: IProjectInfos, currentPath: string): string {
    let dbSchemaFolder = this.getDBUserFromPath(currentPath, projectInfos);
    if (currentPath.includes("db" + path.posix.sep + "_setup")) {
      return projectInfos.dbAdminUser+"".toLowerCase();
    } else {
      if (!projectInfos.useProxy) {
        return `${projectInfos.dbAppUser}`;
      } else {
        return `${projectInfos.dbAppUser}[${dbSchemaFolder}]`;
      }
    }
  }

  getConnection(projectInfos: IProjectInfos, currentPath: string): string {
    return this.buildConnectionUser(projectInfos, currentPath) + `/${projectInfos.dbAppPwd}@${projectInfos.dbTns}`;
  }


   setInitialCompileInfo(execFileName:string, fileUri: vscode.Uri, runnerInfo:IBashInfos):void {
    let projectInfos: IProjectInfos = getProjectInfos(this.context);
    const activeFile = fileUri.fsPath.split(path.sep).join(path.posix.sep);

    runnerInfo.runFile  = path.resolve(__dirname, "..", "dist", execFileName).split(path.sep).join(path.posix.sep);
    runnerInfo.cwd      = path.dirname(activeFile);

    runnerInfo.connectionTns  = projectInfos.dbTns;
    runnerInfo.connectionUser = this.buildConnectionUser(projectInfos, runnerInfo.cwd);
    runnerInfo.connectionPass = runnerInfo.connectionUser === projectInfos.dbAdminUser ? CompileTaskStore.getInstance().adminPwd! : CompileTaskStore.getInstance().appPwd!;
    runnerInfo.projectInfos   = projectInfos;

    if (matchRuleShort(runnerInfo.connectionPass, "${*}") ||
        matchRuleShort(runnerInfo.connectionUser, "${*}") ||
        matchRuleShort(runnerInfo.connectionPass, "${*}")) {
      vscode.window.showErrorMessage("dbFlux: Sourcing or parameters not supported");
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

export function getProjectInfos(context: vscode.ExtensionContext) {
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

export function getDBFlowMode(context: vscode.ExtensionContext):string | undefined {
  let retValue: string | undefined = undefined;
  if (vscode.workspace.workspaceFolders !== undefined) {
    const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
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

function getProjectInfosFromDBFlow():IProjectInfos {
  const projectInfos: IProjectInfos = {} as IProjectInfos;
  if (vscode.workspace.workspaceFolders !== undefined) {
    const f = vscode.workspace.workspaceFolders[0].uri.fsPath;

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

      projectInfos.useProxy = mustUseProxy(projectInfos);

    }
  }

  validateProjectInfos(projectInfos);

  return projectInfos;
}

function getProjectInfosFromDBFlux(context: vscode.ExtensionContext):IProjectInfos {
  const projectInfos: IProjectInfos = {} as IProjectInfos;
  if (vscode.workspace.workspaceFolders !== undefined) {

      projectInfos.dbAppUser   = context.workspaceState.get("dbFlux_DB_APP_USER")!;
      projectInfos.dbAppPwd    = context.workspaceState.get("dbFlux_DB_APP_PWD");
      projectInfos.dbAdminUser = context.workspaceState.get("dbFlux_DB_ADMIN_USER");
      projectInfos.dbAdminPwd  = context.workspaceState.get("dbFlux_DB_ADMIN_PWD");
      projectInfos.dbTns       = context.workspaceState.get("dbFlux_DB_TNS")!;

      projectInfos.appSchema    = context.workspaceState.get("dbFlux_APP_SCHEMA")!;
      projectInfos.logicSchema  = context.workspaceState.get("dbFlux_LOGIC_SCHEMA")!;
      projectInfos.dataSchema   = context.workspaceState.get("dbFlux_DATA_SCHEMA")!;

      projectInfos.useProxy = mustUseProxy(projectInfos);


  }

  validateProjectInfos(projectInfos);

  return projectInfos;
}

function getProjectInfosFromXCL():IProjectInfos {
  const projectInfos: IProjectInfos = {} as IProjectInfos;
  if (vscode.workspace.workspaceFolders !== undefined) {
    const f = vscode.workspace.workspaceFolders[0].uri.fsPath;

    const buildYml = yaml.parse(fs.readFileSync(path.join(f, "xcl.yml")).toString());

    if (buildYml) {
      projectInfos.appSchema    = buildYml.xcl.users.schema_app;
      projectInfos.logicSchema  = buildYml.xcl.users.schema_logic?buildYml.xcl.users.schema_logic:projectInfos.appSchema;
      projectInfos.dataSchema   = buildYml.xcl.users.schema_data?buildYml.xcl.users.schema_data:projectInfos.appSchema;

      projectInfos.useProxy = mustUseProxy(projectInfos);
    }

    if (fs.existsSync(path.join(f, `.xcl/env.yml`))) {
      const applyYml = yaml.parse(fs.readFileSync(path.join(f, `.xcl/env.yml`)).toString());

      if (applyYml) {
        projectInfos.dbAppUser = projectInfos.useProxy?buildYml.xcl.users.user_deployment:buildYml.xcl.users.schema_app;
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
    vscode.window.setStatusBarMessage("$(testing-error-icon) dbFlux > Connection configuration incomplete!");
    setTimeout(function(){
      vscode.window.setStatusBarMessage("");
    }, 4000);

    vscode.window.showErrorMessage(dbConnMsg, "Open configuration").then(selection => {
      if (selection) {
        vscode.commands.executeCommand("dbFlux.showConfig");
      }
    });
  }

  if (
    (projectInfos.appSchema === undefined || !projectInfos.appSchema || projectInfos.appSchema.length === 0) ||
    (projectInfos.logicSchema === undefined || !projectInfos.logicSchema || projectInfos.logicSchema.length === 0) ||
    (projectInfos.dataSchema === undefined || !projectInfos.dataSchema || projectInfos.dataSchema.length === 0)
  ) {
    schemaMsg = `Schema configuration incomplete! Please check your configuration!
    (DATA: ${projectInfos.dataSchema},
    LOGIC: ${projectInfos.logicSchema},
    APP: ${projectInfos.appSchema})
    `;

    vscode.window.setStatusBarMessage("$(testing-error-icon) dbFlux > Schema configuration incomplete!");
    setTimeout(function(){
      vscode.window.setStatusBarMessage("");
    }, 4000);

    vscode.window.showErrorMessage(schemaMsg, "Open configuration").then(selection => {

      if (selection) {
        vscode.commands.executeCommand("dbFlux.showConfig");
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

function mustUseProxy(projectInfos:IProjectInfos) : boolean {
  const allSchemas = [projectInfos.dataSchema, projectInfos.logicSchema, projectInfos.dataSchema];
  const uniqueSchemas = [...new Set(allSchemas)];

  return uniqueSchemas.length > 1;
}