/* eslint-disable @typescript-eslint/naming-convention */
import * as path from "path";

import { AbstractBashTaskProvider, IBashInfos, IProjectInfos } from "./AbstractBashTaskProvider";
import { commands, ExtensionContext, ShellExecution, Task, TaskDefinition, TaskProvider, tasks, TaskScope, Uri, window, workspace } from "vscode";
import { CompileTaskStore, setAppPassword } from "../stores/CompileTaskStore";
import { ConfigurationManager } from "../helper/ConfigurationManager";
import { getActiveFileUri, getRelativePartsFromFile, getWorkingFile, getWorkspaceRootPath, ltrim, matchRuleShort } from "../helper/utilities";
import { existsSync } from "fs";
import { ExportTaskStore } from "../stores/ExportTaskStore";

const which = require('which');

interface ExportTaskDefinition extends TaskDefinition {
  name: string;
  runner: ISQLExportInfos;
}

interface ISQLExportInfos extends IBashInfos {
  exportAppID:        string | undefined;
  exportAppPath:      string | undefined;
  exportFileName:     string | undefined;
  exportPluginName:   string | undefined;
  executableCli:      string;
}

export class ExportPluingFilesProvider extends AbstractBashTaskProvider implements TaskProvider {
  static dbFluxType: string = "dbFlux";

  provideTasks(): Thenable<Task[]> | undefined {
    return this.getExportPluginFilesTask();
  }

  resolveTask(task: Task): Task | undefined {
    return task;
  }


  async getExportPluginFilesTask(): Promise<Task[]> {
    const result: Task[] = [];

    if (ExportTaskStore.getInstance().expPlugin) {
      const runTask: ISQLExportInfos = await this.prepExportInfos(ExportTaskStore.getInstance().expPlugin);
      result.push(this.createExpTask(this.createExpTaskDefinition("exportPluginFiles", runTask)));
    }

    return Promise.resolve(result);
  }

  createExpTaskDefinition(name: string, runner: ISQLExportInfos): ExportTaskDefinition {
    return {
      type: ExportPluingFilesProvider.dbFluxType,
      name,
      runner,
    };
  }

  createExpTask(definition: ExportTaskDefinition): Task {
    let _task = new Task(
      definition,
      TaskScope.Workspace,
      definition.name,
      ExportPluingFilesProvider
    .dbFluxType,
      new ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_SQLCLI:     definition.runner.executableCli,
          DBFLOW_DBTNS:      definition.runner.connectionTns,
          DBFLOW_DBUSER:     definition.runner.connectionUser,
          DBFLOW_DBPASS:     definition.runner.connectionPass,
          DBFLOW_EXP_APP_ID: definition.runner.exportAppID!,
          DBFLOW_EXP_PLG_ID: definition.runner.exportPluginName!,
          DBFLOW_EXP_PATH:   definition.runner.exportAppPath!
        },
      })

    );
    _task.presentationOptions.echo = false;

    return _task;
  }

  async prepExportInfos(pluginFolder:string|undefined): Promise<ISQLExportInfos> {
    let runner: ISQLExportInfos = {} as ISQLExportInfos;

    if (workspace.workspaceFolders && pluginFolder) {
      let fileUri:Uri = workspace.workspaceFolders[0].uri;
      let apexUri:Uri = Uri.file(path.join(fileUri.fsPath, pluginFolder + '/install.sql'));

      runner.exportAppPath  = pluginFolder + "/src";
      const parts:string[] = getRelativePartsFromFile(pluginFolder)
      runner.exportPluginName = parts[2];
      runner.exportAppID    = parts[1].replace("f", "");
      runner.executableCli  = ConfigurationManager.getCliToUseForCompilation();

      if (apexUri !== undefined) {
        await this.setInitialCompileInfo("export_plugin_files.sh", apexUri, runner);
      }
    } else {
      throw "Error workspace.workspaceFolders or schemaName undefined"
    }

    return runner;
  }

}


export function registerExportPluginFilesCommand(projectInfos: IProjectInfos, context: ExtensionContext) {
  return commands.registerCommand("dbFlux.exportPluginFiles", async () => {

    if (projectInfos.isValid) {
      setAppPassword(projectInfos);

      if (CompileTaskStore.getInstance().appPwd !== undefined) {
        which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
          ExportTaskStore.getInstance().expPlugin = await ExportTaskStore.getInstance().getAppPlugID(projectInfos, false);


          if (ExportTaskStore.getInstance().expPlugin !== undefined) {
            context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new ExportPluingFilesProvider(context)));
            await commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: exportPluginFiles");
          } else {
            window.setStatusBarMessage('dbFlux: No Application found or selected', 2000);
          }

        }).catch(() => {
          window.showErrorMessage(`dbFlux: No executable "${ConfigurationManager.getCliToUseForCompilation()}" found on path!`);
        });
      }

    }


  });
};


export class ExportCurrentPluginFileProvider extends AbstractBashTaskProvider implements TaskProvider {
  static dbFluxType: string = "dbFlux";

  provideTasks(): Thenable<Task[]> | undefined {
    return this.getExportObjectTask();
  }

  resolveTask(task: Task): Task | undefined {
    return task;
  }


  async getExportObjectTask(): Promise<Task[]> {
    const result: Task[] = [];
    const runTask: ISQLExportInfos = await this.prepExportInfos();

    result.push(this.createExpTask(this.createExpTaskDefinition("exportCurrentPluginFile", runTask)));


    return Promise.resolve(result);
  }

  createExpTaskDefinition(name: string, runner: ISQLExportInfos): ExportTaskDefinition {
    return {
      type: ExportCurrentPluginFileProvider.dbFluxType,
      name,
      runner,
    };
  }

  createExpTask(definition: ExportTaskDefinition): Task {
    let _task = new Task(
      definition,
      TaskScope.Workspace,
      definition.name,
      ExportCurrentPluginFileProvider.dbFluxType,
      new ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_SQLCLI:      definition.runner.executableCli,
          DBFLOW_DBTNS:       definition.runner.connectionTns,
          DBFLOW_DBUSER:      definition.runner.connectionUser,
          DBFLOW_DBPASS:      definition.runner.connectionPass,
          DBFLOW_EXP_APP_ID:  definition.runner.exportAppID!,
          DBFLOW_EXP_PLG_ID:  definition.runner.exportPluginName!,
          DBFLOW_EXP_PATH:    definition.runner.exportAppPath!,
          DBFLOW_EXP_FNAME:   definition.runner.exportFileName!
        },
      })

    );
    _task.presentationOptions.echo = false;

    return _task;
  }

  async prepExportInfos(): Promise<ISQLExportInfos> {
    let runner: ISQLExportInfos = {} as ISQLExportInfos;

    if (workspace.workspaceFolders) {
      const connectionUri = await getActiveFileUri(this.context);
      const activeFilePath          = connectionUri?.path;

      if (activeFilePath && fileExists(activeFilePath)) {
        const parts:string[] = getRelativePartsFromFile(activeFilePath);
        if (parts[0] === "plugin") {



          runner.executableCli          = ConfigurationManager.getCliToUseForCompilation();
          runner.exportFileName         = workspace.asRelativePath(connectionUri);

          runner.exportAppPath  = runner.exportFileName.substring(0, runner.exportFileName.indexOf('/src/') + 4);
          runner.exportFileName = runner.exportFileName.replace(runner.exportAppPath+"/", "");
          runner.exportPluginName = parts[2];
          runner.exportAppID    = parts[1].replace("f", "");


        }
        await this.setInitialCompileInfo("export_plugin_files.sh", connectionUri!, runner);

      }


    } else {
      throw "Error workspace.workspaceFolders or schemaName undefined"
    }

    return runner;
  }

}


export function registerExportCurrentPluginFileCommand(projectInfos: IProjectInfos, context: ExtensionContext) {
  return commands.registerCommand("dbFlux.exportCurrentPluginFile", async () => {
    // check what file has to build
    let fileName = await getWorkingFile(context);
    const relativeFileName = fileName.replace(getWorkspaceRootPath() + "/", "")


    const insidePlugins = matchRuleShort(relativeFileName, projectInfos.isFlexMode ? 'plugin/*/*/f*/*' : 'plugin/f*/*');

    if (insidePlugins) {
      if (projectInfos.isValid) {
        setAppPassword(projectInfos);

        if (CompileTaskStore.getInstance().appPwd !== undefined) {

          which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
            context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new ExportCurrentPluginFileProvider(context)));
            await commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: exportCurrentPluginFile");
          }).catch(() => {
            window.showErrorMessage('dbFlux: No executable "sql" found on path!');
          });
        }
      }
    } else {
      window.showErrorMessage('dbFlux: Not a plugin src file selected!');
    }

  });
};

function fileExists(activeFilePath: string):boolean {
 const ret = existsSync(path.format(path.parse(activeFilePath))) || existsSync(path.format(path.parse(ltrim(activeFilePath, '/'))));
 return ret;
}
