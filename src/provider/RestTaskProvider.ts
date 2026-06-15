
import * as path from "path";

import { getAllFoldersButNotTheLastFolder, getLastFolderFromFolderPath } from "../helper/utilities";
import { AbstractBashTaskProvider, getProjectInfos, IBashInfos, IProjectInfos } from "./AbstractBashTaskProvider";
import { assertRestApiLevel } from "../helper/RestApiUtils";
import { RestTaskStore } from "../stores/RestTaskStore";
import { commands, ExtensionContext, ShellExecution, Task, TaskDefinition, TaskProvider, tasks, TaskScope, Uri, window, workspace } from "vscode";
import { CompileTaskStore, setAppPassword } from "../stores/CompileTaskStore";

// eslint-disable-next-line @typescript-eslint/no-require-imports
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
      const runTask: IRESTExportInfos = await this.prepExportInfos(RestTaskStore.getInstance().restModule);
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

    const _task = new Task(
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
          DBFLOW_MODE:         definition.runner.projectInfos.projectMode+"",
          ...this.getRestEnv(definition.runner)
        },
      })

    );
    _task.presentationOptions.echo = false;


    return _task;
  }

  async prepExportInfos(moduleFolder:string|undefined): Promise<IRESTExportInfos> {
    const runner: IRESTExportInfos = {} as IRESTExportInfos;

    if (workspace.workspaceFolders) {
      const fileUri:Uri = workspace.workspaceFolders[0].uri;
      const restUri:Uri = Uri.file(path.join(fileUri.fsPath, moduleFolder + '/0000.sql'));

      runner.restModule = moduleFolder;

      if (restUri !== undefined) {
        const projectInfos = await getProjectInfos(this.context);
        await this.setInitialCompileInfo(projectInfos.dbConnMode === "REST" ? "rest_export_rest.sh" : "export_rest.sh", restUri, runner);
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
        if (projectInfos.dbConnMode === "REST" && !(await assertRestApiLevel(projectInfos, "Export REST Module"))) {
          return;
        }

        const cliCheck: Promise<unknown> = projectInfos.dbConnMode === "REST" ? Promise.resolve() : which('sql');
        cliCheck.then(async () => {
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