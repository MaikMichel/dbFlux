import * as path from "path";
import * as dotenv from "dotenv";
import { execFile } from "child_process";
import { promisify } from "util";
import { appendFileSync, chmodSync, existsSync, PathLike, readFileSync, readdirSync } from "fs";
import { findSchemaPwdKey, getPassword, getWorkspaceRootPath, matchRuleShort } from "../helper/utilities";
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
  dbConnMode: string|undefined;
  restOauthTokenUrl: string|undefined;
  // restOauthClientId: string|undefined;
  // restOauthClientSecret: string|undefined;
  restSqlUrl: string|undefined;
  restAppSchema: string|undefined;
  restWorkspace: string|undefined;
}

export interface IDBFlowVariables {
  names: string[];
  values: Record<string, string>;
}

const dbFlowVariableNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseDBFlowVariables(
  applyEnv: Record<string, string | undefined>,
  inheritedEnv: NodeJS.ProcessEnv = process.env,
): IDBFlowVariables {
  const names = Array.from(new Set(
    (applyEnv.VAR_LIST ?? "")
      .split(":")
      .map((name) => name.trim())
      .filter((name) => dbFlowVariableNamePattern.test(name)),
  ));

  const values: Record<string, string> = {};
  for (const name of names) {
    values[name] = applyEnv[name] ?? inheritedEnv[name] ?? "";
  }

  return { names, values };
}

export abstract class AbstractBashTaskProvider {
  context: ExtensionContext;
  dbFluxMode: string;

  constructor(context: ExtensionContext) {
    this.context = context;
    this.dbFluxMode = getDBFlowMode(context)!;
  }

  static dbFluxType: string = "dbFlux";

  static CONN_DATA:  string = "DATA";
  static CONN_LOGIC: string = "LOGIC";
  static CONN_APP:   string = "APP";


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



  // env block needed by every script that talks to the REST endpoint
  getRestEnv(runnerInfo: IBashInfos): { [key: string]: string } {
    return {
      DBFLOW_REST_SQL_URL:          runnerInfo.projectInfos.restSqlUrl ?? "",
      DBFLOW_REST_OAUTH_TOKEN_URL:  runnerInfo.projectInfos.restOauthTokenUrl ?? "",
      DBFLOW_REST_APP_SCHEMA:       runnerInfo.projectInfos.restAppSchema ?? "",
      DBFLOW_REST_WORKSPACE:        runnerInfo.projectInfos.restWorkspace ?? "",
      DBFLOW_REST_CONNECT_TIMEOUT:  String(ConfigurationManager.getRestCompileConnectTimeout()),
      DBFLOW_REST_TOKEN_MAX_TIME:   String(ConfigurationManager.getRestCompileTokenMaxTime()),
      DBFLOW_REST_COMPILE_MAX_TIME: String(ConfigurationManager.getRestCompileCompileMaxTime()),
      DBFLOW_REST_EXPORT_MAX_TIME:  String(ConfigurationManager.getRestCompileExportMaxTime()),
    };
  }

  getDBFlowVarEnv(): { [key: string]: string } {
    if (this.dbFluxMode !== "dbFlow" || workspace.workspaceFolders === undefined) {
      return {};
    }

    const applyEnvPath = path.join(workspace.workspaceFolders[0].uri.fsPath, "apply.env");
    if (!existsSync(applyEnvPath)) {
      return {};
    }

    const variables = parseDBFlowVariables(dotenv.parse(readFileSync(applyEnvPath)));
    const env: { [key: string]: string } = {
      DBFLOW_VAR_LIST: variables.names.join(":"),
    };

    for (const name of variables.names) {
      env[`DBFLOW_VAR_${name}`] = variables.values[name];
    }

    return env;
  }

   async setInitialCompileInfo(execFileName:string, fileUri: Uri, runnerInfo:IBashInfos):Promise<void> {
    const projectInfos: IProjectInfos = await getProjectInfos(this.context);
    const activeFile = fileUri.fsPath.split(path.sep).join(path.posix.sep);


    runnerInfo.runFile  = path.resolve(__dirname, "..", "..", "dist", "shell", execFileName).split(path.sep).join(path.posix.sep);
    if (existsSync(runnerInfo.runFile)) {
      chmodSync(runnerInfo.runFile, 0o755);
    }
    runnerInfo.cwd      = path.dirname(activeFile);

    if (projectInfos.dbConnMode !== "REST") {
      runnerInfo.connectionTns  = projectInfos.dbTns;
      runnerInfo.connectionUser = this.buildConnectionUser(projectInfos, runnerInfo.cwd, fileUri.path);
    } else {
      runnerInfo.connectionUser = "";
    }
    runnerInfo.connectionPass = getPassword(projectInfos, runnerInfo.connectionUser, false, this.context);

    // setAppPassword only checks that some password is available, the one for this connection user may still be missing
    if (!runnerInfo.connectionPass) {
      const message = `dbFlux: No password available for ${runnerInfo.connectionUser || "the connection"}`;
      window.showErrorMessage(message);
      throw new Error(message);
    }

    // apply.env may have been created after activation
    void ensureApplyEnvIgnored(getWorkspaceRootPath());

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
  const dbUserFromPath = getDBUserFromPath(currentPath, projectInfos, currentFilePath);

  if (dbUserFromPath.toLowerCase() === (projectInfos.dbAdminUser+"").toLowerCase()) {
    return projectInfos.dbAdminUser+"";
  }

  // SINGLE: DB_APP_USER always connects, without proxy and ignoring schema passwords
  if (projectInfos.projectMode?.toUpperCase() === "SINGLE" && projectInfos.dbAppUser) {
    return projectInfos.dbAppUser;
  }

  // a schema password (dbFlux_..._PWD) means connecting directly as the schema
  if (findSchemaPwdKey(projectInfos.dbPasses, dbUserFromPath) !== undefined) {
    return `${dbUserFromPath}`;
  }

  // otherwise as usual
  if (projectInfos.dbAppUser?.toLowerCase() === dbUserFromPath.toLowerCase()) {
    return `${projectInfos.dbAppUser}`;
  }
  return `${projectInfos.dbAppUser}[${dbUserFromPath}]`;
}

// apply.env may hold passwords (dbFlux_<SCHEMA>_PWD), so it must never be committed.
// Once confirmed as ignored it is not checked again, unless forced (e.g. on config save).
const execFileAsync = promisify(execFile);
let applyEnvIgnoreCheck: Promise<void> | undefined;
let applyEnvIgnoreConfirmed = false;
let applyEnvIgnoreFailed = false;

export function ensureApplyEnvIgnored(workspaceRoot: string, force = false): Promise<void> {
  // a failed attempt (no git, .gitignore not writable) is not repeated on every compile
  if ((applyEnvIgnoreConfirmed || applyEnvIgnoreFailed) && !force) {
    return Promise.resolve();
  }
  // concurrent calls share one check, otherwise each of them could append the line
  applyEnvIgnoreCheck = (applyEnvIgnoreCheck ?? checkApplyEnvIgnored(workspaceRoot)).finally(() => {
    applyEnvIgnoreCheck = undefined;
  });
  return applyEnvIgnoreCheck;
}

async function checkApplyEnvIgnored(workspaceRoot: string): Promise<void> {
  try {
    if (!existsSync(path.join(workspaceRoot, "apply.env")) || !existsSync(path.join(workspaceRoot, ".git"))) {
      return;
    }
    try {
      // exit code 0: already ignored (by .gitignore, a pattern like *.env, or a parent ignore)
      await execFileAsync("git", ["check-ignore", "-q", "apply.env"], { cwd: workspaceRoot });
      applyEnvIgnoreConfirmed = true;
      return;
    } catch {
      // not ignored (exit 1) or git is not available, so add the line
    }
    const gitIgnore = path.join(workspaceRoot, ".gitignore");
    const content = existsSync(gitIgnore) ? readFileSync(gitIgnore, "utf8") : "";
    if (!content.split(/\r?\n/).some(line => ["apply.env", "/apply.env", "**/apply.env"].includes(line.trim()))) {
      appendFileSync(gitIgnore, `${content.length > 0 && !content.endsWith("\n") ? "\n" : ""}apply.env\n`);
      LoggingService.logInfo("apply.env added to .gitignore");
    }
    applyEnvIgnoreConfirmed = true;
  } catch (e) {
    applyEnvIgnoreFailed = true;
    LoggingService.logWarning(`could not add apply.env to .gitignore: ${e}`);
  }
}

// values starting with ! are base64 encoded
export function decodeEnvValue(value: string): string {
  return value.startsWith("!") ? Buffer.from(value.substring(1), "base64").toString("utf8").replace(/(\r?\n)+$/, "") : value;
}

export async function getProjectInfos(context: ExtensionContext) {
  let projectInfos: IProjectInfos = {} as IProjectInfos;
  if (getDBFlowMode(context) === "dbFlux") {
    projectInfos = await getProjectInfosFromDBFlux(context);
  } else if (getDBFlowMode(context) === "dbFlow") {
    projectInfos = await getProjectInfosFromDBFlow(context);
  }
  return projectInfos;
}

export function getDBFlowMode(context: ExtensionContext):string | undefined {
  let retValue: string | undefined = undefined;
  if (workspace.workspaceFolders !== undefined) {
    const workspaceFolder = workspace.workspaceFolders[0].uri.fsPath;
    const buildFile = path.join(workspaceFolder, "build.env");
    if (existsSync(buildFile)) {
      retValue = "dbFlow";
    }


    if (retValue === undefined) {
      retValue = context.workspaceState.get("dbFlux_mode");
    }
  }

  return retValue;
}

export function applyFileExists() {
  return workspace.workspaceFolders
       && existsSync(path.join(workspace.workspaceFolders[0].uri.fsPath, "apply.env"));
}


async function getProjectInfosFromDBFlow(context: ExtensionContext):Promise<IProjectInfos> {
  const projectInfos: IProjectInfos = {} as IProjectInfos;

  if (workspace.workspaceFolders !== undefined) {
    const f = workspace.workspaceFolders[0].uri.fsPath;

    const applyEnv = dotenv.config({
      path: path.join(f, "apply.env"),
      quiet: true
    });
    const buildEnv = dotenv.config({
      path: path.join(f, "build.env"),
      quiet: true
    });


    if (applyEnv.parsed) {
      projectInfos.dbConnMode  = applyEnv.parsed.CONN_MODE ?? "SQLNET";

      projectInfos.dbAppUser   = applyEnv.parsed.DB_APP_USER;
      projectInfos.dbAppPwd    = projectInfos.dbConnMode === "SQLNET" ? applyEnv.parsed.DB_APP_PWD : applyEnv.parsed.REST_OAUTH_BASIC_B64;
      projectInfos.dbAdminUser = applyEnv.parsed.DB_ADMIN_USER;
      projectInfos.dbAdminPwd  = applyEnv.parsed.DB_ADMIN_PWD;
      projectInfos.dbTns       = applyEnv.parsed.DB_TNS;

      // decode when starting with an !
      if (projectInfos.dbAppPwd && projectInfos.dbAppPwd.startsWith("!")) {
        projectInfos.dbAppPwd = decodeEnvValue(projectInfos.dbAppPwd);
      }
      // decode when starting with an !
      if (projectInfos.dbAdminPwd && projectInfos.dbAdminPwd.startsWith("!")) {
        projectInfos.dbAdminPwd = decodeEnvValue(projectInfos.dbAdminPwd);
      }

      // check restCompile

      projectInfos.restSqlUrl            = applyEnv.parsed.REST_SQL_URL;
      projectInfos.restAppSchema         = applyEnv.parsed.REST_APP_SCHEMA;
      projectInfos.restWorkspace         = applyEnv.parsed.REST_WORKSPACE;
      projectInfos.restOauthTokenUrl     = applyEnv.parsed.REST_OAUTH_TOKEN_URL;

      // schema passwords from apply.env, a secret with the same key overrides them below
      for (const [key, value] of Object.entries(applyEnv.parsed ?? {})) {
        if (key.startsWith("dbFlux_") && key.endsWith("_PWD") && value) {
          projectInfos.dbPasses = projectInfos.dbPasses || {};
          projectInfos.dbPasses[key] = decodeEnvValue(value);
        }
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
      projectInfos.appSchema    = buildEnv.parsed.APP_SCHEMA;
      projectInfos.logicSchema  = buildEnv.parsed.LOGIC_SCHEMA;
      projectInfos.dataSchema   = buildEnv.parsed.DATA_SCHEMA;

      projectInfos.projectMode  = resolveProjectMode(buildEnv.parsed.PROJECT_MODE, projectInfos.dbConnMode, projectInfos).projectMode;

      projectInfos.isFlexMode  = (projectInfos.projectMode?.toUpperCase() === "FLEX");
      projectInfos.workspace   = buildEnv.parsed.WORKSPACE;
    }
  }

  await validateProjectInfos(projectInfos);

  return projectInfos;
}

async function getProjectInfosFromDBFlux(context: ExtensionContext):Promise<IProjectInfos> {
  const projectInfos: IProjectInfos = {} as IProjectInfos;
  if (workspace.workspaceFolders !== undefined) {

      projectInfos.dbAppUser   = context.workspaceState.get("dbFlux_DB_APP_USER")!;
      projectInfos.dbAppPwd    = await context.secrets.get(getWorkspaceRootPath()+"|dbFlux_DB_APP_PWD");
      projectInfos.dbAdminUser = context.workspaceState.get("dbFlux_DB_ADMIN_USER");
      projectInfos.dbAdminPwd  = context.workspaceState.get("dbFlux_DB_ADMIN_PWD");
      projectInfos.dbTns       = context.workspaceState.get("dbFlux_DB_TNS")!;

      projectInfos.appSchema    = context.workspaceState.get("dbFlux_APP_SCHEMA")!;
      projectInfos.logicSchema  = context.workspaceState.get("dbFlux_LOGIC_SCHEMA")!;
      projectInfos.dataSchema   = context.workspaceState.get("dbFlux_DATA_SCHEMA")!;


      projectInfos.projectMode  = getStoredOrInferredProjectMode(context);
      projectInfos.isFlexMode   = projectInfos.projectMode === "FLEX";
      projectInfos.projectName  = context.workspaceState.get("dbFlux_PROJECT");
      projectInfos.workspace    = context.workspaceState.get("dbFlux_WORKSPACE");
      projectInfos.dbConnMode   = context.workspaceState.get("dbFlux_CONN_MODE") ?? "SQLNET";

      if (projectInfos.dbConnMode === "REST") {
        projectInfos.restWorkspace     = context.workspaceState.get("dbFlux_REST_WORKSPACE");
        projectInfos.restAppSchema     = context.workspaceState.get("dbFlux_REST_APP_SCHEMA");
        projectInfos.restSqlUrl        = context.workspaceState.get("dbFlux_REST_SQL_URL");
        projectInfos.restOauthTokenUrl = context.workspaceState.get("dbFlux_REST_OAUTH_TOKEN_URL");
        projectInfos.dbAppPwd          = await context.secrets.get(getWorkspaceRootPath()+"|dbFlux_REST_OAUTH_BASIC_B64");
      }

      // get all keys with pattern dbFlux_..._PWD and store them in array
      const filteredKeys = context.workspaceState.keys().filter(key => key.startsWith("dbFlux_") && key.endsWith("_PWD"));

      for (const key of filteredKeys) {
        LoggingService.logInfo('Custom Schemapassword found: ' + key);
        projectInfos.dbPasses = projectInfos.dbPasses || {};
        projectInfos.dbPasses[key]    = await context.secrets.get(getWorkspaceRootPath()+"|" + key )+"";
      }

  }

  await validateProjectInfos(projectInfos);

  return projectInfos;
}

async function validateProjectInfos(projectInfos: IProjectInfos) {
  let dbConnMsg = "";
  let schemaMsg = "";

  if (
      ( projectInfos.dbConnMode === "SQLNET"
        && (
                (projectInfos.dbAppUser === undefined || !projectInfos.dbAppUser || projectInfos.dbAppUser.length === 0)
            ||  (projectInfos.dbTns === undefined || !projectInfos.dbTns || projectInfos.dbTns?.length === 0))

      )
      ||
      ( projectInfos.dbConnMode === "REST"
        && (
                 (projectInfos.restSqlUrl === undefined || !projectInfos.restSqlUrl || projectInfos.restSqlUrl.length === 0)
             ||  (projectInfos.restOauthTokenUrl === undefined || !projectInfos.restOauthTokenUrl || projectInfos.restOauthTokenUrl.length === 0)
            )
      )
    ) {
    dbConnMsg = `dbFlux: Connection configuration incomplete! Please check your configuration!
    (User: ${projectInfos.dbAppUser}, Connection: ${projectInfos.dbTns}, ConnMode: ${projectInfos.dbConnMode}${projectInfos.dbConnMode === "REST" ? `, REST URL: ${projectInfos.restSqlUrl}, TOKEN URL: ${projectInfos.restOauthTokenUrl}` : ""})
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
  return /^\d+$/.test(str);
}

// "010_data" -> "data": only a numeric first segment followed by "_" is removed.
// Shared by the connection user resolution and the project mode inference, so both see the same schema name.
export function stripNumericPrefix(name: string): string {
  const parts = name.split("_");
  return parts.length > 1 && isNumeric(parts[0]) ? parts.slice(1).join("_") : name;
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
    returnDBUser = stripNumericPrefix(returnDBUser);
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

// True when every schema folder has its own password, so no app password is needed.
export function allSchemaFoldersHaveOwnPassword(projectInfos: IProjectInfos): boolean {
  try {
    const dbFolderName = ConfigurationManager.getDBFolderName();
    const folders = getSchemaFolders(path.join(getWorkspaceRootPath(), dbFolderName));
    return folders.length > 0 && folders.every(folder =>
      findSchemaPwdKey(projectInfos.dbPasses, getDBUserFromPath(`${dbFolderName}/${folder}`, projectInfos)) !== undefined);
  } catch (e) {
    return false;
  }
}

export interface IConfiguredSchemas {
  appSchema?:   string;
  logicSchema?: string;
  dataSchema?:  string;
}

// Used when no project mode is stored. SINGLE/MULTI only when the schema folders match the
// configured schemas, otherwise FLEX. Without (readable) schema folders the configured schemas decide:
// three different ones are MULTI, more than one is FLEX, otherwise SINGLE.
export function inferProjectMode(dbFolder: string, schemas: IConfiguredSchemas = {}): string {
  // no schema folders to look at (fresh project or unreadable db folder): decide by the configured schemas
  const fallbackMode = () => {
    const configured = [schemas.appSchema, schemas.logicSchema, schemas.dataSchema].filter(schema => !!schema).map(schema => schema!.toLowerCase());
    const distinct = new Set(configured).size;
    if (distinct === 3) {
      return "MULTI";
    }
    return distinct > 1 ? "FLEX" : "SINGLE";
  };

  let folders: string[];
  try {
    folders = getSchemaFolders(dbFolder);
  } catch (e) {
    LoggingService.logWarning(`could not read schema folders of ${dbFolder}, using the configured schemas to infer the project mode`);
    return fallbackMode();
  }

  // remove a leading number with underscore, like the connection user resolution does
  const folderNames = folders.map(folder => stripNumericPrefix(folder).toLowerCase());
  const matches = (schema?: string) => !!schema && folderNames.includes(schema.toLowerCase());

  if (folderNames.length === 0) {
    return fallbackMode();
  } else if (folderNames.length === 1 && matches(schemas.appSchema)) {
    return "SINGLE";
  } else if (folderNames.length === 3 && matches(schemas.appSchema) && matches(schemas.logicSchema) && matches(schemas.dataSchema)) {
    return "MULTI";
  }
  return "FLEX";
}

// The one place deciding the project mode of a dbFlow project (loader and config panel):
// REST is always SINGLE, otherwise the stored mode, otherwise the one inferred from the db folder.
// "detected" is true when the mode is only inferred, i.e. not saved yet.
export function resolveProjectMode(storedMode: string | undefined, connMode: string | undefined, schemas: IConfiguredSchemas = {}): { projectMode: string, detected: boolean } {
  if (connMode?.trim().toUpperCase() === "REST") {
    return { projectMode: "SINGLE", detected: false };
  }
  if (storedMode) {
    return { projectMode: storedMode, detected: false };
  }
  return { projectMode: inferProjectMode(getDBFolderPath(), schemas), detected: true };
}

export function getDBFolderPath(): string {
  return path.join(getWorkspaceRootPath(), ConfigurationManager.getDBFolderName());
}

export function getStoredOrInferredProjectMode(context: ExtensionContext): string {
  return resolveProjectMode(
    context.workspaceState.get<string>("dbFlux_PROJECT_MODE"),
    context.workspaceState.get<string>("dbFlux_CONN_MODE"),
    {
      appSchema:   context.workspaceState.get<string>("dbFlux_APP_SCHEMA"),
      logicSchema: context.workspaceState.get<string>("dbFlux_LOGIC_SCHEMA"),
      dataSchema:  context.workspaceState.get<string>("dbFlux_DATA_SCHEMA"),
    }
  ).projectMode;
}

// projectInfos loaded at activation; all registered commands share this object
let activeProjectInfos: IProjectInfos | undefined;

export function setActiveProjectInfos(projectInfos: IProjectInfos): void {
  activeProjectInfos = projectInfos;
}

export function setProjectContextKeys(projectInfos: IProjectInfos, context: ExtensionContext): void {
  commands.executeCommand("setContext", "isDbFlowFlexMode", projectInfos.isFlexMode);
  commands.executeCommand("setContext", "isDBFluxMode", (getDBFlowMode(context) === "dbFlux"));
  commands.executeCommand("setContext", "isSingleMode", projectInfos.projectMode === "SINGLE");
}

// Reloads the shared projectInfos in place, so commands use the saved config without a window reload.
// All commands keep a reference to this one object and read its fields on each run, so updating it in place is enough.
// Returns false when no project was loaded at activation (commands are not registered yet) or the reload failed.
// Orders overlapping reloads: a result is applied unless a newer reload already applied its own.
// If the newer reload fails or is still running, the older valid result is the latest one and gets applied.
export function createRefreshGate(): { start: () => number, tryApply: (id: number) => boolean } {
  let counter = 0;
  let lastApplied = 0;
  return {
    start: () => ++counter,
    tryApply: (id: number) => {
      if (id < lastApplied) {
        return false;
      }
      lastApplied = id;
      return true;
    },
  };
}

const refreshGate = createRefreshGate();
export async function refreshActiveProjectInfos(context: ExtensionContext): Promise<boolean> {
  if (!activeProjectInfos) {
    return false;
  }

  const refreshId = refreshGate.start();
  let reloaded: IProjectInfos;
  try {
    await ensureApplyEnvIgnored(getWorkspaceRootPath(), true);
    reloaded = await getProjectInfos(context);
  } catch (e) {
    LoggingService.logError(`could not reload the project configuration: ${e}`);
    return false;
  }

  // a newer refresh already applied its result, so don't overwrite it with this older one
  if (!refreshGate.tryApply(refreshId)) {
    return true;
  }

  // no await between clearing and filling, so no other code can see the half-empty object
  for (const key of Object.keys(activeProjectInfos)) {
    delete (activeProjectInfos as any)[key];
  }
  Object.assign(activeProjectInfos, reloaded);
  setProjectContextKeys(activeProjectInfos, context);
  return true;
}

export async function getDBSchemaFolders():Promise<QuickPickItem[]> {
  if (workspace.workspaceFolders){
      const wsRoot = workspace.workspaceFolders[0].uri.fsPath;
      const sourceDB = path.join(wsRoot, ConfigurationManager.getDBFolderName());

      return getSchemaFolders(sourceDB).map(function(element){return {"label":element, "description":ConfigurationManager.getDBFolderName()+"/"+element , "alwaysShow": true};});

  }
  return [{label: "", description:""}];
}
