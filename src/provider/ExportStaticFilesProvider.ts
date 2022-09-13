/* eslint-disable @typescript-eslint/naming-convention */
import * as path from "path";

import { AbstractBashTaskProvider, getProjectInfos, IBashInfos } from "./AbstractBashTaskProvider";
import { commands, ExtensionContext, ShellExecution, Task, TaskDefinition, TaskProvider, TaskScope, Uri, window, workspace } from "vscode";
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
  executableCli:      string;
}

export class ExportStaticFilesProvider extends AbstractBashTaskProvider implements TaskProvider {
  static dbFluxType: string = "dbFlux";

  provideTasks(): Thenable<Task[]> | undefined {
    return this.getExportStaticFilesTask();
  }

  resolveTask(task: Task): Task | undefined {
    return task;
  }


  async getExportStaticFilesTask(): Promise<Task[]> {
    const result: Task[] = [];

    if (ExportTaskStore.getInstance().expID) {
      const runTask: ISQLExportInfos = this.prepExportInfos(ExportTaskStore.getInstance().expID);
      result.push(this.createExpTask(this.createExpTaskDefinition("exportStaticFiles", runTask)));
    }

    return Promise.resolve(result);
  }

  createExpTaskDefinition(name: string, runner: ISQLExportInfos): ExportTaskDefinition {
    return {
      type: ExportStaticFilesProvider.dbFluxType,
      name,
      runner,
    };
  }

  createExpTask(definition: ExportTaskDefinition): Task {
    let _task = new Task(
      definition,
      TaskScope.Workspace,
      definition.name,
      ExportStaticFilesProvider
    .dbFluxType,
      new ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_SQLCLI:     definition.runner.executableCli,
          DBFLOW_DBTNS:      definition.runner.connectionTns,
          DBFLOW_DBUSER:     definition.runner.connectionUser,
          DBFLOW_DBPASS:     definition.runner.connectionPass,
          DBFLOW_EXP_APP_ID: definition.runner.exportAppID!,
          DBFLOW_EXP_PATH:   definition.runner.exportAppPath!
        },
      })

    );
    _task.presentationOptions.echo = false;

    return _task;
  }

  prepExportInfos(appFolder:string|undefined): ISQLExportInfos {
    let runner: ISQLExportInfos = {} as ISQLExportInfos;

    if (workspace.workspaceFolders && appFolder) {
      let fileUri:Uri = workspace.workspaceFolders[0].uri;
      let apexUri:Uri = Uri.file(path.join(fileUri.fsPath, appFolder + '/install.sql'));

      runner.exportAppPath  = appFolder.replace("apex/", "static/") + "/src";
      runner.exportAppID    = appFolder.split("/").pop()?.replace("f", "");
      runner.executableCli  = ConfigurationManager.getCliToUseForCompilation();

      if (apexUri !== undefined) {
        this.setInitialCompileInfo("export_static_files.sh", apexUri, runner);
      }
    } else {
      throw "Error workspace.workspaceFolders or schemaName undefined"
    }

    return runner;
  }

}


export function registerExportStaticFilesCommand(context: ExtensionContext) {
  return commands.registerCommand("dbFlux.exportStaticFiles", async () => {
    const projectInfosReloaded = getProjectInfos(context);

    if (projectInfosReloaded.isValid) {
      setAppPassword(projectInfosReloaded);

      if (CompileTaskStore.getInstance().appPwd !== undefined) {
        which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
          ExportTaskStore.getInstance().expID = await ExportTaskStore.getInstance().getAppID(projectInfosReloaded);

          if (ExportTaskStore.getInstance().expID !== undefined) {
            await commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: exportStaticFiles");
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


export class ExportCurrentStaticFileProvider extends AbstractBashTaskProvider implements TaskProvider {
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

    result.push(this.createExpTask(this.createExpTaskDefinition("exportCurrentStaticFile", runTask)));


    return Promise.resolve(result);
  }

  createExpTaskDefinition(name: string, runner: ISQLExportInfos): ExportTaskDefinition {
    return {
      type: ExportCurrentStaticFileProvider.dbFluxType,
      name,
      runner,
    };
  }

  createExpTask(definition: ExportTaskDefinition): Task {
    let _task = new Task(
      definition,
      TaskScope.Workspace,
      definition.name,
      ExportCurrentStaticFileProvider.dbFluxType,
      new ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_SQLCLI:      definition.runner.executableCli,
          DBFLOW_DBTNS:       definition.runner.connectionTns,
          DBFLOW_DBUSER:      definition.runner.connectionUser,
          DBFLOW_DBPASS:      definition.runner.connectionPass,
          DBFLOW_EXP_APP_ID:  definition.runner.exportAppID!,
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
      const connectionUri = await getActiveFileUri();
      const activeFilePath          = connectionUri?.path;

      if (activeFilePath && fileExists(activeFilePath)) {
        const parts:string[] = getRelativePartsFromFile(activeFilePath);
        if (parts[0] === "static") {



          runner.executableCli          = ConfigurationManager.getCliToUseForCompilation();
          runner.exportFileName         = workspace.asRelativePath(connectionUri);

          runner.exportAppPath  = runner.exportFileName.substring(0, runner.exportFileName.indexOf('/src/') + 4);
          runner.exportFileName = runner.exportFileName.replace(runner.exportAppPath+"/", "");

          runner.exportAppID    = runner.exportAppPath.replace("/src", "").split("/").pop()?.replace("f", "");

        }
          this.setInitialCompileInfo("export_static_files.sh", connectionUri!, runner);
        
      }


    } else {
      throw "Error workspace.workspaceFolders or schemaName undefined"
    }

    return runner;
  }

}


export function registerExportCurrentStaticFileCommand(context: ExtensionContext) {
  return commands.registerCommand("dbFlux.exportCurrentStaticFile", async () => {
    const projectInfosReloaded = getProjectInfos(context);

    // check what file has to build
    let fileName = await getWorkingFile();
    const relativeFileName = fileName.replace(getWorkspaceRootPath() + "/", "")


    const insideStatic = matchRuleShort(relativeFileName, 'static/*/src/*');

    if (insideStatic) {
      if (projectInfosReloaded.isValid) {
        setAppPassword(projectInfosReloaded);

        if (CompileTaskStore.getInstance().appPwd !== undefined) {

          which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
            await commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: exportCurrentStaticFile");
          }).catch(() => {
            window.showErrorMessage('dbFlux: No executable "sql" found on path!');
          });
        }
      }
    } else {
      window.showErrorMessage('dbFlux: Not a static src file selected!');
    }

  });
};

function fileExists(activeFilePath: string):boolean {
 const ret = existsSync(path.format(path.parse(activeFilePath))) || existsSync(path.format(path.parse(ltrim(activeFilePath, '/'))));
 return ret;
}
