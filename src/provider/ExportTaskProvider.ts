/* eslint-disable @typescript-eslint/naming-convention */
import * as path from "path";

import { getAllFoldersButNotTheLastFolder, getLastFolderFromFolderPath } from "../helper/utilities";
import { ExportTaskStore } from "../stores/ExportTaskStore";
import { AbstractBashTaskProvider, IBashInfos, IProjectInfos } from "./AbstractBashTaskProvider";
import { commands, ExtensionContext, ShellExecution, Task, TaskDefinition, TaskProvider, tasks, TaskScope, Uri, window, workspace } from "vscode";
import { CompileTaskStore, setAppPassword } from "../stores/CompileTaskStore";
import { ConfigurationManager } from "../helper/ConfigurationManager";

const which = require('which');

interface ExportTaskDefinition extends TaskDefinition {
  name: string;
  runner: ISQLExportInfos;
}

interface ISQLExportInfos extends IBashInfos {
  appID: string | undefined;
}

interface ISQLExportPlugingInfos extends ISQLExportInfos {
  pluginID: string | undefined;
}

export class ExportTaskProvider extends AbstractBashTaskProvider implements TaskProvider {
  static dbFluxType: string = "dbFlux";
  private _taskName: string;

  constructor(context: ExtensionContext, taskName: string = "exportAPEX") {
    super(context);
    this._taskName = taskName;
  }

  provideTasks(): Thenable<Task[]> | undefined {
    return this.getExpTasks();
  }

  resolveTask(task: Task): Task | undefined {
    return task;
  }


  async getExpTasks(): Promise<Task[]> {
    const result: Task[] = [];

    if (ExportTaskStore.getInstance().expID) {
      const runTask: ISQLExportInfos = await this.prepExportInfos(ExportTaskStore.getInstance().expID);
      result.push(this.createExpTask(this.createExpTaskDefinition(this._taskName, runTask)));
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
          DBFLOW_APPID:     appID.length>0?appID:appFolder==="*"?"*":"NULL",
          DBFLOW_APPFOLDER: folder?folder:"NULL",
          DBFLOW_MODE:      definition.runner.projectInfos.projectMode+"",
          DBFLOW_EXPORT_OPTION: ConfigurationManager.getAppExportOptions() + ""
        },
      })

    );
    _task.presentationOptions.echo = false;


    return _task;
  }

  async prepExportInfos(appFolder:string|undefined): Promise<ISQLExportInfos> {
    let runner: ISQLExportInfos = {} as ISQLExportInfos;

    if (workspace.workspaceFolders) {
      let fileUri:Uri = workspace.workspaceFolders[0].uri;
      let apexUri:Uri = Uri.file(path.join(fileUri.fsPath, appFolder + '/install.sql'));

      runner.appID = appFolder;

      if (apexUri !== undefined) {
        await this.setInitialCompileInfo("export_app.sh", apexUri, runner);
      }
    }

    return runner;
  }

}


export class ExportTaskPluginProvider extends AbstractBashTaskProvider implements TaskProvider {
  static dbFluxType: string = "dbFlux";

  provideTasks(): Thenable<Task[]> | undefined {
    return this.getExpTasks();
  }

  resolveTask(task: Task): Task | undefined {
    return task;
  }


  async getExpTasks(): Promise<Task[]> {
    const result: Task[] = [];

    if (ExportTaskStore.getInstance().expPlugin) {
      const runTask: ISQLExportPlugingInfos = await this.prepExportInfos(ExportTaskStore.getInstance().expPlugin);
      result.push(this.createExpTask(this.createExpTaskDefinition("exportAPEXPlugin", runTask)));
    }

    return Promise.resolve(result);
  }

  createExpTaskDefinition(name: string, runner: ISQLExportPlugingInfos): ExportTaskDefinition {
    return {
      type: ExportTaskPluginProvider.dbFluxType,
      name,
      runner,
    };
  }

  createExpTask(definition: ExportTaskDefinition): Task {
    console.log('definition', definition);

    const plugFolder = ExportTaskStore.getInstance().expPlugin!;
    const pathItems = plugFolder?.split('/');
    const plugAppID = pathItems[pathItems?.length-2];
    const plugID = pathItems[pathItems?.length-1];

    let _task = new Task(
      definition,
      TaskScope.Workspace,
      definition.name,
      ExportTaskPluginProvider.dbFluxType,
      new ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_DBTNS:     definition.runner.connectionTns,
          DBFLOW_DBUSER:    definition.runner.connectionUser,
          DBFLOW_DBPASS:    definition.runner.connectionPass,
          DBFLOW_APPID:     plugAppID,
          DBFLOW_PLGFOLDER: plugFolder,
          DBFLOW_PLGID:     plugID,
          DBFLOW_MODE:      definition.runner.projectInfos.projectMode+"",
          DBFLOW_EXPORT_OPTION: ConfigurationManager.getAppExportOptions() + ""
        },
      })

    );
    _task.presentationOptions.echo = false;

    console.log('_task', _task);
    return _task;
  }

  async prepExportInfos(pluginFolder:string|undefined): Promise<ISQLExportPlugingInfos> {
    let runner: ISQLExportPlugingInfos = {} as ISQLExportPlugingInfos;

    if (workspace.workspaceFolders) {
      let fileUri:Uri = workspace.workspaceFolders[0].uri;
      let apexUri:Uri = Uri.file(path.join(fileUri.fsPath, pluginFolder + '/install.sql'));

      runner.pluginID = pluginFolder;

      if (apexUri !== undefined) {
        await this.setInitialCompileInfo("export_plug.sh", apexUri, runner);
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
          ExportTaskStore.getInstance().expID = await ExportTaskStore.getInstance().getAppID(projectInfos, true);

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

export function registerExportAPEXPluginCommand(projectInfos: IProjectInfos, context: ExtensionContext) {
  return commands.registerCommand("dbFlux.exportAPEX.plugin", async () => {

    if (projectInfos.isValid) {
      setAppPassword(projectInfos);

      if (CompileTaskStore.getInstance().appPwd !== undefined) {
        which('sql').then(async () => {
          try {

            ExportTaskStore.getInstance().expPlugin = await ExportTaskStore.getInstance().getAppPlugID(projectInfos, false);

            if (ExportTaskStore.getInstance().expPlugin !== undefined) {
              context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new ExportTaskPluginProvider(context)));
              await commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: exportAPEXPlugin");
            } else {
              window.setStatusBarMessage('dbFlux: No Plugin found or selected', 2000);
            }
          } catch (err) {
            console.log("err", err);
            window.showErrorMessage(err+"");
          }
        }).catch(() => {
          window.showErrorMessage('dbFlux: No executable "sql" found on path!');
        });
      }
    }
  });
};
