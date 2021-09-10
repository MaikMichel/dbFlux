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
  static dbFluxType: string = "dbFlux";

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
      type: RestTaskProvider.dbFluxType,
      name,
      runner,
    };
  }

  createRestTask(definition: RestTaskDefinition): vscode.Task {
    let _task = new vscode.Task(
      definition,
      vscode.TaskScope.Workspace,
      definition.name,
      RestTaskProvider.dbFluxType,
      new vscode.ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_DBTNS:      definition.runner.connectionTns,
          DBFLOW_DBUSER:     definition.runner.connectionUser,
          DBFLOW_DBPASS:     definition.runner.connectionPass,
          DBFLOW_RESTMODULE: definition.runner.restModule?definition.runner.restModule:"NULL",
        },
      })

    );
    _task.presentationOptions.echo = false;


    return _task;
  }

  prepExportInfos(): IRESTExportInfos {
    let runner: IRESTExportInfos = {} as IRESTExportInfos;

    if (vscode.workspace.workspaceFolders) {
      let fileUri:vscode.Uri = vscode.workspace.workspaceFolders[0].uri;
      let restUri:vscode.Uri = vscode.Uri.file(path.join(fileUri.fsPath, 'rest/modules/0000.sql'));

      if (restUri !== undefined) {
        this.setInitialCompileInfo("export_rest.sh", restUri, runner);
      }
    }

    return runner;
  }

}
