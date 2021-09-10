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
  static dbFluxType: string = "dbFlux";

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
      type: ExportTaskProvider.dbFluxType,
      name,
      runner,
    };
  }

  createExpTask(definition: ExportTaskDefinition): vscode.Task {
    let _task = new vscode.Task(
      definition,
      vscode.TaskScope.Workspace,
      definition.name,
      ExportTaskProvider.dbFluxType,
      new vscode.ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_DBTNS: definition.runner.connectionTns,
          DBFLOW_DBUSER: definition.runner.connectionUser,
          DBFLOW_DBPASS: definition.runner.connectionPass,
          DBFLOW_APPID: definition.runner.appID?definition.runner.appID:"NULL",
        },
      })

    );
    _task.presentationOptions.echo = false;


    return _task;
  }

  prepExportInfos(): ISQLExportInfos {
    let runner: ISQLExportInfos = {} as ISQLExportInfos;

    if (vscode.workspace.workspaceFolders) {
      let fileUri:vscode.Uri = vscode.workspace.workspaceFolders[0].uri;
      let apexUri:vscode.Uri = vscode.Uri.file(path.join(fileUri.fsPath, 'apex/f0000/install.sql'));

      if (apexUri !== undefined) {
        this.setInitialCompileInfo("export_app.sh", apexUri, runner);
      }
    }

    return runner;
  }

}
