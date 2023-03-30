/* eslint-disable @typescript-eslint/naming-convention */
import * as path from "path";

import { getAllFoldersButNotTheLastFolder, getLastFolderFromFolderPath } from "../helper/utilities";
import { AbstractBashTaskProvider, IBashInfos, IProjectInfos } from "./AbstractBashTaskProvider";
import { RestTaskStore } from "../stores/RestTaskStore";
import { commands, ExtensionContext, ShellExecution, Task, TaskDefinition, TaskProvider, tasks, TaskScope, Uri, window, workspace } from "vscode";
import { CompileTaskStore, setAppPassword } from "../stores/CompileTaskStore";

const which = require('which');

interface RestTaskDefinition extends TaskDefinition {
  name: string;
  runner: IRESTExportInfos;
}

interface IRESTExportInfos extends IBashInfos {
  restModule: string | undefined;
}

export class RestTaskProvider extends AbstractBashTaskProvider implements TaskProvider {
  static dbFluxType: string = "dbFlux";

  provideTasks(): Thenable<Task[]> | undefined {
    return this.getRestTasks();
  }

  resolveTask(task: Task): Task | undefined {
    return task;
  }


  async getRestTasks(): Promise<Task[]> {
    const result: Task[] = [];

    if (RestTaskStore.getInstance().restModule) {
      const runTask: IRESTExportInfos = this.prepExportInfos(RestTaskStore.getInstance().restModule);
      result.push(this.createRestTask(this.createRestTaskDefinition("exportREST", runTask)));
    }

    return Promise.resolve(result);
  }

  createRestTaskDefinition(name: string, runner: IRESTExportInfos): RestTaskDefinition {
    return {
      type: RestTaskProvider.dbFluxType,
      name,
      runner,
    };
  }

  createRestTask(definition: RestTaskDefinition): Task {
    const module = getLastFolderFromFolderPath(definition.runner.restModule);
    const folder = getAllFoldersButNotTheLastFolder(definition.runner.restModule);

    let _task = new Task(
      definition,
      TaskScope.Workspace,
      definition.name,
      RestTaskProvider.dbFluxType,
      new ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_DBTNS:        definition.runner.connectionTns,
          DBFLOW_DBUSER:       definition.runner.connectionUser,
          DBFLOW_DBPASS:       definition.runner.connectionPass,
          DBFLOW_RESTMODULE:   module?module:"NULL",
          DBFLOW_MODULEFOLDER: folder?folder:"NULL",
          DBFLOW_MODE:         definition.runner.projectInfos.projectMode+""
        },
      })

    );
    _task.presentationOptions.echo = false;


    return _task;
  }

  prepExportInfos(moduleFolder:string|undefined): IRESTExportInfos {
    let runner: IRESTExportInfos = {} as IRESTExportInfos;

    if (workspace.workspaceFolders) {
      let fileUri:Uri = workspace.workspaceFolders[0].uri;
      let restUri:Uri = Uri.file(path.join(fileUri.fsPath, moduleFolder + '/0000.sql'));

      runner.restModule = moduleFolder;

      if (restUri !== undefined) {
        this.setInitialCompileInfo("export_rest.sh", restUri, runner);
      }
    }

    return runner;
  }

}


export function registerExportRESTCommand(projectInfos: IProjectInfos, context: ExtensionContext) {
  return commands.registerCommand("dbFlux.exportREST", async () => {

    if (projectInfos.isValid) {
      setAppPassword(projectInfos);

      if (CompileTaskStore.getInstance().appPwd !== undefined) {
        which('sql').then(async () => {
          RestTaskStore.getInstance().restModule = await RestTaskStore.getInstance().getRestModule(projectInfos);
          if (RestTaskStore.getInstance().restModule !== undefined) {
            context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new RestTaskProvider(context)));
            await commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: exportREST");
          }
        }).catch((e: any) => {
          console.error(e);
          window.showErrorMessage('dbFlux: No executable "sql" found on path!');
        });
      }
    }
  });
}