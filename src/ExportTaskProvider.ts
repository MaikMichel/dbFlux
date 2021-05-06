/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as dotenv from "dotenv";
import * as path from "path";

import { matchRuleShort } from "./utilities";
import { ExportTaskStore } from "./ExportTaskStore";
import { AbstractBashTaskProvider, IBashInfos } from "./AbstractBashTaskProvider";


interface ExportTaskDefinition extends vscode.TaskDefinition {
  name: string;
  runner: ISQLExportInfos;
}

interface ISQLExportInfos extends IBashInfos {
  appID: string | undefined;
}

export class ExportTaskProvider extends AbstractBashTaskProvider implements vscode.TaskProvider {
  static dbFlowType: string = "dbFlow";

  provideTasks(): Thenable<vscode.Task[]> | undefined {
    return this.getExpTasks();
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    return task;
  }


  async getExpTasks(): Promise<vscode.Task[]> {
    const result: vscode.Task[] = [];

    const runTask: ISQLExportInfos = this.prepExportInfos();
    runTask.appID = ExportTaskStore.getInstance().expID;

    result.push(this.createExpTask(this.createExpTaskDefinition("exportAPEX", runTask)));

    return Promise.resolve(result);
  }

  createExpTaskDefinition(name: string, runner: ISQLExportInfos): ExportTaskDefinition {
    return {
      type: ExportTaskProvider.dbFlowType,
      name,
      runner,
    };
  }

  createExpTask(definition: ExportTaskDefinition): vscode.Task {
    let _task = new vscode.Task(
      definition,
      vscode.TaskScope.Workspace,
      definition.name,
      ExportTaskProvider.dbFlowType,
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
        runner.connectionUser = this.getAppConnection(applyEnv, buildEnv);
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

}
