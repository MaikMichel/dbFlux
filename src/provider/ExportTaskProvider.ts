/* eslint-disable @typescript-eslint/naming-convention */
import * as path from "path";

import { getAllFoldersButNotTheLastFolder, getLastFolderFromFolderPath } from "../helper/utilities";
import { ExportTaskStore } from "../stores/ExportTaskStore";
import { AbstractBashTaskProvider, IBashInfos, IProjectInfos } from "./AbstractBashTaskProvider";
import { commands, ExtensionContext, ShellExecution, Task, TaskDefinition, TaskProvider, tasks, TaskScope, Uri, window, workspace } from "vscode";
import { CompileTaskStore, setAppPassword } from "../stores/CompileTaskStore";

const which = require('which');

interface ExportTaskDefinition extends TaskDefinition {
  name: string;
  runner: ISQLExportInfos;
}

interface ISQLExportInfos extends IBashInfos {
  appID: string | undefined;
}

export class ExportTaskProvider extends AbstractBashTaskProvider implements TaskProvider {
  static dbFluxType: string = "dbFlux";

  provideTasks(): Thenable<Task[]> | undefined {
    return this.getExpTasks();
  }

  resolveTask(task: Task): Task | undefined {
    return task;
  }


  async getExpTasks(): Promise<Task[]> {
    const result: Task[] = [];

    if (ExportTaskStore.getInstance().expID) {
      const runTask: ISQLExportInfos = this.prepExportInfos(ExportTaskStore.getInstance().expID);
      result.push(this.createExpTask(this.createExpTaskDefinition("exportAPEX", runTask)));
    }

    return Promise.resolve(result);
  }

  createExpTaskDefinition(name: string, runner: ISQLExportInfos): ExportTaskDefinition {
    return {
      type: ExportTaskProvider.dbFluxType,
      name,
      runner,
    };
  }

  createExpTask(definition: ExportTaskDefinition): Task {
    // appID aus pfad holen
    const appFolder = getLastFolderFromFolderPath(definition.runner.appID);
    const appID = appFolder?appFolder.substring(1):"";
    const folder = getAllFoldersButNotTheLastFolder(definition.runner.appID);

    let _task = new Task(
      definition,
      TaskScope.Workspace,
      definition.name,
      ExportTaskProvider.dbFluxType,
      new ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_DBTNS:     definition.runner.connectionTns,
          DBFLOW_DBUSER:    definition.runner.connectionUser,
          DBFLOW_DBPASS:    definition.runner.connectionPass,
          DBFLOW_APPID:     appID.length>0?appID:"NULL",
          DBFLOW_APPFOLDER: folder?folder:"NULL"
        },
      })

    );
    _task.presentationOptions.echo = false;


    return _task;
  }

  prepExportInfos(appFolder:string|undefined): ISQLExportInfos {
    let runner: ISQLExportInfos = {} as ISQLExportInfos;

    if (workspace.workspaceFolders) {
      let fileUri:Uri = workspace.workspaceFolders[0].uri;
      let apexUri:Uri = Uri.file(path.join(fileUri.fsPath, appFolder + '/install.sql'));

      runner.appID = appFolder;

      if (apexUri !== undefined) {
        this.setInitialCompileInfo("export_app.sh", apexUri, runner);
      }
    }

    return runner;
  }

}


export function registerExportAPEXCommand(projectInfos: IProjectInfos, context: ExtensionContext) {
  return commands.registerCommand("dbFlux.exportAPEX", async () => {

    if (projectInfos.isValid) {
      setAppPassword(projectInfos);

      if (CompileTaskStore.getInstance().appPwd !== undefined) {
        which('sql').then(async () => {
          ExportTaskStore.getInstance().expID = await ExportTaskStore.getInstance().getAppID(projectInfos);

          if (ExportTaskStore.getInstance().expID !== undefined) {
            context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new ExportTaskProvider(context)));
            await commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: exportAPEX");
          } else {
            window.setStatusBarMessage('dbFlux: No Application found or selected', 2000);
          }
        }).catch(() => {
          window.showErrorMessage('dbFlux: No executable "sql" found on path!');
        });
      }
    }
  });
};