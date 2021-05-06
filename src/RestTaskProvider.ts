/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as dotenv from "dotenv";
import * as path from "path";

import { matchRuleShort } from "./utilities";
import { AbstractBashTaskProvider, IBashInfos } from "./AbstractBashTaskProvider";
import { RestTaskStore } from "./RestTaskStore";


interface RestTaskDefinition extends vscode.TaskDefinition {
  name: string;
  runner: IRESTExportInfos;
}

interface IRESTExportInfos extends IBashInfos {
  restModule: string | undefined;
}

export class RestTaskProvider extends AbstractBashTaskProvider implements vscode.TaskProvider {
  static dbFlowType: string = "dbFlow";

  provideTasks(): Thenable<vscode.Task[]> | undefined {
    return this.getRestTasks();
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    return task;
  }


  async getRestTasks(): Promise<vscode.Task[]> {
    const result: vscode.Task[] = [];

    const runTask: IRESTExportInfos = this.prepExportInfos();
    runTask.restModule = RestTaskStore.getInstance().restModule;

    result.push(this.createRestTask(this.createRestTaskDefinition("exportREST", runTask)));

    return Promise.resolve(result);
  }

  createRestTaskDefinition(name: string, runner: IRESTExportInfos): RestTaskDefinition {
    return {
      type: RestTaskProvider.dbFlowType,
      name,
      runner,
    };
  }

  createRestTask(definition: RestTaskDefinition): vscode.Task {
    let _task = new vscode.Task(
      definition,
      vscode.TaskScope.Workspace,
      definition.name,
      RestTaskProvider.dbFlowType,
      new vscode.ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_DBTNS:      definition.runner.connectionTns,
          DBFLOW_DBUSER:     definition.runner.connectionUser,
          DBFLOW_DBPASS:     definition.runner.connectionPass,
          DBFLOW_RESTMODULE: definition.runner.restModule!,
        },
      })

    );
    _task.presentationOptions.echo = false;


    return _task;
  }

  prepExportInfos(): IRESTExportInfos {
    let runner: IRESTExportInfos = {} as IRESTExportInfos;

    if (vscode.workspace.workspaceFolders !== undefined) {
      runner.cwd = vscode.workspace.workspaceFolders[0].uri.fsPath;

      const applyEnv = dotenv.config({ path: this.findClosestEnvFile(runner.cwd, "apply.env") });
      const buildEnv = dotenv.config({ path: this.findClosestEnvFile(runner.cwd, "build.env") });

      if (applyEnv.parsed !== undefined) {
        runner.runFile = path.resolve(__dirname, "..", "dist", "export_rest.sh").split(path.sep).join("/");
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
