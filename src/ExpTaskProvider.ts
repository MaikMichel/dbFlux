/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

import { matchRuleShort } from "./utilities";

interface ExpTaskDefinition extends vscode.TaskDefinition {
  name: string;
  runner: ISQLExportInfos;
}

interface ISQLExportInfos {
  runFile: string;
  connectionTns: string;
  connectionUser: string;
  connectionPass: string;
  cwd: string;
  appID: string | undefined;
}

export class ExpTaskProvider implements vscode.TaskProvider {
  static dbFlowType: string = "dbFlow";

  provideTasks(token:any): Thenable<vscode.Task[]> | undefined {
    console.log('token:', token);
    return this.getExpTasks();
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    console.log('taskresove:', task);
    return task;
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

  async getExpTasks(): Promise<vscode.Task[]> {
    let result: vscode.Task[] = [];
    const runTask: ISQLExportInfos = this.prepExportInfos();
    // console.log('runTask', runTask);
    runTask.appID = await this.getAppID();
    console.log("appID:", runTask.appID);
    result.push(this.createExpTask(this.createExpTaskDefinition("exportAPEX", runTask)));

    return Promise.resolve(result);
  }

  createExpTaskDefinition(name: string, runner: ISQLExportInfos): ExpTaskDefinition {
    return {
      type: ExpTaskProvider.dbFlowType,
      name,
      runner,
    };
  }

  createExpTask(definition: ExpTaskDefinition): vscode.Task {
    let _task = new vscode.Task(
      definition,
      vscode.TaskScope.Workspace,
      definition.name,
      ExpTaskProvider.dbFlowType,
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

  prepExportInfos(): ISQLExportInfos {
    let runner: ISQLExportInfos = {} as ISQLExportInfos;

    if (vscode.workspace.workspaceFolders !== undefined) {
      runner.cwd = vscode.workspace.workspaceFolders[0].uri.fsPath;

      const applyEnv = dotenv.config({ path: this.findClosestEnvFile(runner.cwd, "apply.env") });
      const buildEnv = dotenv.config({ path: this.findClosestEnvFile(runner.cwd, "build.env") });

      if (applyEnv.parsed !== undefined) {
        runner.runFile = path.resolve(__dirname, "..", "dist", "export_app.sh").split(path.sep).join("/");
        runner.connectionTns = applyEnv.parsed.DB_TNS.length > 0 ? applyEnv.parsed.DB_TNS : "not_set";
        runner.connectionUser = this.buildConnectionUser(applyEnv, buildEnv);
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

  // TODO: Validate existence of vars
  buildConnectionUser(applyEnv: dotenv.DotenvConfigOutput, buildEnv: dotenv.DotenvConfigOutput): string {
    if (buildEnv.parsed?.USE_PROXY === "FALSE") {
      return `${applyEnv.parsed?.DB_APP_USER}`;
    } else {
      return `${applyEnv.parsed?.DB_APP_USER}[${buildEnv.parsed?.APP_SCHEMA}]`;
    }
  }
}
