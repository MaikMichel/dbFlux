/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { ConfigurationManager } from "./ConfigurationManager";
import { matchRuleShort } from "./utilities";

interface OraTaskDefinition extends vscode.TaskDefinition {
  name: string;
  runner: IBashInfos;
}

interface IBashInfos {
  runFile: string;
  connectionTns: string;
  connectionUser: string;
  connectionPass: string;
  activeFile: string;
  relativeWSPath: string;
  cwd: string;
  executableCli: string;
  moveYesNo: string;
  appID: string | undefined;
}

export class OraTaskProvider implements vscode.TaskProvider {
  static dbFlowType: string = "dbFlow";



  provideTasks(): Thenable<vscode.Task[]> | undefined {
    return this.getCompileTasks();
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    return task;
  }

  async getCompileTasks(): Promise<vscode.Task[]> {
    const result: vscode.Task[] = [];

    const compileTaske: IBashInfos = this.prepCompInfos();
    result.push(this.createOraTask(this.createOraTaskDefinition("compileFile", compileTaske)));

    // const exportTask: IBashInfos = await this.prepExportInfos();
    // result.push(this.createExpTask(this.createOraTaskDefinition("exportAPEX", exportTask)));

    return Promise.resolve(result);
  }

  createOraTaskDefinition(name: string, runner: IBashInfos): OraTaskDefinition {
    return {
      type: OraTaskProvider.dbFlowType,
      name,
      runner,
    };
  }

  createOraTask(definition: OraTaskDefinition): vscode.Task {
    let _task = new vscode.Task(
      definition,
      vscode.TaskScope.Workspace,
      definition.name,
      OraTaskProvider.dbFlowType,
      new vscode.ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_DBTNS: definition.runner.connectionTns,
          DBFLOW_DBUSER: definition.runner.connectionUser,
          DBFLOW_DBPASS: definition.runner.connectionPass,
          DBFLOW_FILE: definition.runner.activeFile,
          DBFLOW_WSPACE: definition.runner.relativeWSPath,
          DBFLOW_SQLCLI: definition.runner.executableCli,
          DBFLOW_MOVEYN: definition.runner.moveYesNo,
        },
      }),
      ["$dbflow-plsql"]
    );
    _task.presentationOptions.echo = false;
    return _task;
  }

  createExpTask(definition: OraTaskDefinition): vscode.Task {
    let _task = new vscode.Task(
      definition,
      vscode.TaskScope.Workspace,
      definition.name,
      OraTaskProvider.dbFlowType,
      new vscode.ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_DBTNS: definition.runner.connectionTns,
          DBFLOW_DBUSER: definition.runner.connectionUser,
          DBFLOW_DBPASS: definition.runner.connectionPass,
          DBFLOW_APPID: definition.runner.appID!,
        },
      })
    );
    _task.presentationOptions.echo = false;
    return _task;
  }

  prepCompInfos(): IBashInfos {
    let runner: IBashInfos = {} as IBashInfos;

    if (vscode.window.activeTextEditor !== undefined) {
      runner.runFile = path.resolve(__dirname, "..", "dist", "deploy.sh").split(path.sep).join("/");
      runner.activeFile = vscode.window.activeTextEditor?.document.fileName.split(path.sep).join("/");
      runner.cwd = path.dirname(vscode.window.activeTextEditor?.document.fileName);
      runner.relativeWSPath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor?.document.uri!);
      runner.executableCli = ConfigurationManager.getInstance().sqlExecutable;
      runner.moveYesNo = "NO";

      // if we are on static and a file with runner.activeFile.sql exists then we are uploading to
      // apex and hopefully build the sql file ...
      if (matchRuleShort(runner.activeFile, "*/static/f*/src*") && fs.existsSync(runner.activeFile + ".sql")) {
        runner.activeFile += ".sql";
        runner.moveYesNo = "YES";
      }

      const applyEnv = dotenv.config({ path: this.findClosestEnvFile(runner.cwd, "apply.env") });
      const buildEnv = dotenv.config({ path: this.findClosestEnvFile(runner.cwd, "build.env") });

      if (applyEnv.parsed !== undefined) {
        runner.connectionTns = applyEnv.parsed.DB_TNS.length > 0 ? applyEnv.parsed.DB_TNS : "not_set";
        runner.connectionUser = this.buildConnectionUser(applyEnv, buildEnv, runner.cwd);
        runner.connectionPass = applyEnv.parsed.DB_APP_PWD.length > 0 ? applyEnv.parsed.DB_APP_PWD : "not_set";

        if (matchRuleShort(runner.connectionPass, "${*}") || matchRuleShort(runner.connectionUser, "${*}") || matchRuleShort(runner.connectionPass, "${*}")) {
          vscode.window.showErrorMessage("dbFlow: Sourcing or parameters not supported");
          throw new Error("dbFlow: Sourcing or parameters not supported");
        }
      } else {
        vscode.window.showErrorMessage("dbFlow: Could not parse apply.env");
        throw new Error("dbFlow: Could not parse apply.env");
      }
    }

    return runner;
  }

  async prepExportInfos(): Promise<IBashInfos> {
    let runner: IBashInfos = {} as IBashInfos;

    if (vscode.workspace.workspaceFolders !== undefined) {
      runner.cwd = vscode.workspace.workspaceFolders[0].uri.fsPath;

      const applyEnv = dotenv.config({ path: this.findClosestEnvFile(runner.cwd, "apply.env") });
      const buildEnv = dotenv.config({ path: this.findClosestEnvFile(runner.cwd, "build.env") });

      if (applyEnv.parsed !== undefined) {
        runner.runFile = path.resolve(__dirname, "..", "dist", "export_app.sh").split(path.sep).join("/");
        runner.connectionTns = applyEnv.parsed.DB_TNS.length > 0 ? applyEnv.parsed.DB_TNS : "not_set";
        runner.connectionUser = this.getAppConnectionUser(applyEnv, buildEnv);
        runner.connectionPass = applyEnv.parsed.DB_APP_PWD.length > 0 ? applyEnv.parsed.DB_APP_PWD : "not_set";

        if (matchRuleShort(runner.connectionPass, "${*}") || matchRuleShort(runner.connectionUser, "${*}") || matchRuleShort(runner.connectionPass, "${*}")) {
          vscode.window.showErrorMessage("dbFlow: Sourcing or parameters not supported");
          throw new Error("dbFlow: Sourcing or parameters not supported");
        }
        runner.appID = await this.getAppID();
      } else {
        vscode.window.showErrorMessage("dbFlow: Could not parse apply.env");
        throw new Error("dbFlow: Could not parse apply.env");
      }
    }

    return runner;
  }

  async getAppID() {
    if (vscode.workspace.workspaceFolders !== undefined) {
      const source = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, "apex");

      const getDirectories = (source: fs.PathLike) =>
        fs
          .readdirSync(source, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory() && dirent.name.toLowerCase().startsWith("f"))
          .map((dirent) => dirent.name);
      const apps = getDirectories(source);
      const value = await vscode.window.showQuickPick(apps, { placeHolder: "Select Application to export" });

      return value?.substring(1);
    } else {
      return;
    }
  }

  findClosestEnvFile(pathname: string, filename: string): string | undefined {
    let file = path.join(pathname, filename);
    let filePath = pathname;

    if (vscode.workspace.workspaceFolders !== undefined) {
      const wsf = vscode.workspace.workspaceFolders[0].uri.fsPath;
      let i = 0;

      while (i < 10 && (file.indexOf(wsf) < 0 || !fs.existsSync(file))) {
        i++;
        const folders = filePath.split(path.sep);
        folders.pop();
        filePath = folders.join(path.sep);
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

  getDBUserFromPath(pathName: string, buildEnv: dotenv.DotenvConfigOutput): string {
    let returnDBUser: string|undefined = buildEnv.parsed?.APP_SCHEMA!.toLowerCase(); // sql File inside static or rest
    if (pathName.includes("db" + path.sep + buildEnv.parsed?.DATA_SCHEMA!.toLowerCase())) {
      returnDBUser = buildEnv.parsed?.DATA_SCHEMA!.toLowerCase();
    } else if (pathName.includes("db" + path.sep + buildEnv.parsed?.LOGIC_SCHEMA!.toLowerCase())) {
      returnDBUser = buildEnv.parsed?.LOGIC_SCHEMA!.toLowerCase();
    } else if (pathName.includes("db" + path.sep + buildEnv.parsed?.APP_SCHEMA!.toLowerCase())) {
      returnDBUser = buildEnv.parsed?.APP_SCHEMA!.toLowerCase();
    }
    return returnDBUser+"";
  }

  // TODO: Validate existence of vars
  buildConnectionUser(applyEnv: dotenv.DotenvConfigOutput, buildEnv: dotenv.DotenvConfigOutput, currentPath: string): string {
    if (buildEnv.parsed?.USE_PROXY === "FALSE") {
      return `${applyEnv.parsed?.DB_APP_USER}`;
    } else {
      let dbSchemaFolder = this.getDBUserFromPath(currentPath, buildEnv);

      return `${applyEnv.parsed?.DB_APP_USER}[${dbSchemaFolder}]`;
    }
  }

  getAppConnectionUser(applyEnv: dotenv.DotenvConfigOutput, buildEnv: dotenv.DotenvConfigOutput): string {
    if (buildEnv.parsed?.USE_PROXY === "FALSE") {
      return `${applyEnv.parsed?.DB_APP_USER}`;
    } else {
      return `${applyEnv.parsed?.DB_APP_USER}[${buildEnv.parsed?.APP_SCHEMA}]`;
    }
  }
}
