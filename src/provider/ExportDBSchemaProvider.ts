/* eslint-disable @typescript-eslint/naming-convention */
import * as path from "path";

import { AbstractBashTaskProvider, getDBFlowMode, IBashInfos, IProjectInfos } from "./AbstractBashTaskProvider";
import { commands, ExtensionContext, ShellExecution, Task, TaskDefinition, TaskProvider, tasks, TaskScope, Uri, window, workspace } from "vscode";
import { CompileTaskStore, setAppPassword } from "../stores/CompileTaskStore";
import { ExportDBSchemaStore } from "../stores/ExportDBSchemaStore";
import { ConfigurationManager } from "../helper/ConfigurationManager";
import { getActiveFileUri, getObjectNameFromFile, getObjectTypePathFromFile, getRelativePartsFromFile, getSchemaFromFile, getWorkingFile, getWorkspaceRootPath, ltrim, matchRuleShort } from "../helper/utilities";
import { existsSync } from "fs";
import { exportObjectWizard, exportSchemaWizard, ExportSchemaWizardState } from "../wizards/ExportSchemaWizard";

const which = require('which');

interface ExportTaskDefinition extends TaskDefinition {
  name: string;
  runner: ISQLExportInfos;
}

interface ISQLExportInfos extends IBashInfos {
  schemaNameNew: string | undefined;
  schemaName: string | undefined;
  exportFolder: string | undefined;
  exportFileName: string | undefined;
  executableCli:      string;
}

export class ExportDBSchemaProvider extends AbstractBashTaskProvider implements TaskProvider {
  static dbFluxType: string = "dbFlux";

  provideTasks(): Thenable<Task[]> | undefined {
    return this.getExportSchemaTask();
  }

  resolveTask(task: Task): Task | undefined {
    return task;
  }


  async getExportSchemaTask(): Promise<Task[]> {
    const result: Task[] = [];

    if (ExportDBSchemaStore.getInstance().schemaName) {
      const runTask: ISQLExportInfos = await this.prepExportInfos(ExportDBSchemaStore.getInstance().schemaName,
                                                                  ExportDBSchemaStore.getInstance().schemaNameNew);
      result.push(this.createExpTask(this.createExpTaskDefinition("exportSchema", runTask)));
    }

    return Promise.resolve(result);
  }

  createExpTaskDefinition(name: string, runner: ISQLExportInfos): ExportTaskDefinition {
    return {
      type: ExportDBSchemaProvider.dbFluxType,
      name,
      runner,
    };
  }

  createExpTask(definition: ExportTaskDefinition): Task {
    let _task = new Task(
      definition,
      TaskScope.Workspace,
      definition.name,
      ExportDBSchemaProvider.dbFluxType,
      new ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_SQLCLI:     definition.runner.executableCli,
          DBFLOW_DBTNS:      definition.runner.connectionTns,
          DBFLOW_DBUSER:     definition.runner.connectionUser,
          DBFLOW_DBPASS:     definition.runner.connectionPass,
          DBFLOW_SCHEMA:     definition.runner.schemaName!,
          DBFLOW_SCHEMA_NEW: definition.runner.schemaNameNew!,
          DBFLOW_EXP_GRANTS_W_OBJ:  ConfigurationManager.getGrantsOfViewsAndSourcesAtObject()
        },
      })

    );
    _task.presentationOptions.echo = false;

    return _task;
  }

  async prepExportInfos(schemaName:string|undefined, schemaNameNew:string|undefined): Promise<ISQLExportInfos> {
    let runner: ISQLExportInfos = {} as ISQLExportInfos;

    if (workspace.workspaceFolders && schemaName !== undefined) {
      const connectionUri = Uri.file(path.join(workspace.workspaceFolders[0].uri.path, ConfigurationManager.getDBFolderName(), schemaName, "tables", "egal.sql"))
      runner.schemaName = schemaName;
      runner.schemaNameNew = schemaNameNew;
      runner.executableCli      = ConfigurationManager.getCliToUseForCompilation();

      // if (schemaName !== undefined) {
        CompileTaskStore.getInstance().selectedSchemas = [schemaName];
        await this.setInitialCompileInfo("export_schema.sh", connectionUri, runner);
      // }
    } else {
      throw "Error workspace.workspaceFolders or schemaName undefined"
    }

    return runner;
  }

}


export function registerExportDBSchemaCommand(projectInfos: IProjectInfos, context: ExtensionContext) {
  return commands.registerCommand("dbFlux.exportSchema", async () => {

    if (projectInfos.isValid) {
      setAppPassword(projectInfos);

      if (CompileTaskStore.getInstance().appPwd !== undefined) {
        which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
          const state:ExportSchemaWizardState = await exportSchemaWizard(context);

          ExportDBSchemaStore.getInstance().schemaName = state.schemaName.label;
          ExportDBSchemaStore.getInstance().schemaNameNew = state.newSchemaName;

          context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new ExportDBSchemaProvider(context)));
          await commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: exportSchema");

        }).catch(() => {
          window.showErrorMessage('dbFlux: No executable "sql" found on path!');
        });
      }
    }
  });
};

export class ExportDBObjectProvider extends AbstractBashTaskProvider implements TaskProvider {
  static dbFluxType: string = "dbFlux";

  provideTasks(): Thenable<Task[]> | undefined {
    return this.getExportObjectTask();
  }

  resolveTask(task: Task): Task | undefined {
    return task;
  }


  async getExportObjectTask(): Promise<Task[]> {
    const result: Task[] = [];
    const runTask: ISQLExportInfos = await this.prepExportInfos(ExportDBSchemaStore.getInstance().schemaName,
                                                                ExportDBSchemaStore.getInstance().schemaNameNew);

    result.push(this.createExpTask(this.createExpTaskDefinition("exportObject", runTask)));


    return Promise.resolve(result);
  }

  createExpTaskDefinition(name: string, runner: ISQLExportInfos): ExportTaskDefinition {
    return {
      type: ExportDBObjectProvider.dbFluxType,
      name,
      runner,
    };
  }

  createExpTask(definition: ExportTaskDefinition): Task {
    let _task = new Task(
      definition,
      TaskScope.Workspace,
      definition.name,
      ExportDBObjectProvider.dbFluxType,
      new ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_SQLCLI:            definition.runner.executableCli,
          DBFLOW_DBTNS:             definition.runner.connectionTns,
          DBFLOW_DBUSER:            definition.runner.connectionUser,
          DBFLOW_DBPASS:            definition.runner.connectionPass,
          DBFLOW_SCHEMA:            definition.runner.schemaName!,
          DBFLOW_SCHEMA_NEW:        definition.runner.schemaNameNew!,
          DBFLOW_EXP_FOLDER:        definition.runner.exportFolder!,
          DBFLOW_EXP_FNAME:         definition.runner.exportFileName!,
          DBFLOW_EXP_GRANTS_W_OBJ:  ConfigurationManager.getGrantsOfViewsAndSourcesAtObject()
        },
      })

    );
    _task.presentationOptions.echo = false;

    return _task;
  }

  async prepExportInfos(schemaName:string|undefined, schemaNameNew:string|undefined): Promise<ISQLExportInfos> {
    let runner: ISQLExportInfos = {} as ISQLExportInfos;

    if (workspace.workspaceFolders) {
      const connectionUri = await getActiveFileUri(this.context);
      runner.executableCli          = ConfigurationManager.getCliToUseForCompilation();
      const activeFilePath          = connectionUri?.path;


      if (activeFilePath && fileExists(activeFilePath)) {
        // runner.schemaName             = getSchemaFromFile(activeFilePath!);

        runner.schemaName = schemaName;
        runner.schemaNameNew = schemaNameNew;

        const parts:string[] = getRelativePartsFromFile(activeFilePath);
        if (parts[0] === ConfigurationManager.getDBFolderName()) {
          runner.exportFolder           = getObjectTypePathFromFile(activeFilePath!);
          runner.exportFileName         = getObjectNameFromFile(activeFilePath!);
        }
      }

      await this.setInitialCompileInfo("export_schema.sh", connectionUri!, runner);

    } else {
      throw "Error workspace.workspaceFolders or schemaName undefined"
    }

    return runner;
  }

}


export function registerExportDBObjectCommand(projectInfos: IProjectInfos, context: ExtensionContext) {
  return commands.registerCommand("dbFlux.exportObject", async () => {
    // check what file has to build
    let fileName = await getWorkingFile(context);
    const relativeFileName = fileName.replace(getWorkspaceRootPath() + "/", "")


    const insideSetup = (matchRuleShort(relativeFileName, `${ConfigurationManager.getDBFolderName()}/_setup/*`) || matchRuleShort(relativeFileName, `${ConfigurationManager.getDBFolderName()}/.setup/*`) || matchRuleShort(relativeFileName, `${ConfigurationManager.getDBFolderName()}/.hooks/*`));
    const insideDb = !insideSetup && matchRuleShort(relativeFileName, `${ConfigurationManager.getDBFolderName()}/*`);

    if (insideDb) {
      if (projectInfos.isValid) {
        setAppPassword(projectInfos);

        if (CompileTaskStore.getInstance().appPwd !== undefined) {

          which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
            const schema = getSchemaFromFile(fileName, getDBFlowMode(context) === "dbFlux");
            const state:ExportSchemaWizardState = await exportObjectWizard(context, schema);

            ExportDBSchemaStore.getInstance().schemaName = state.schemaName.label;
            ExportDBSchemaStore.getInstance().schemaNameNew = state.newSchemaName;

            context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new ExportDBObjectProvider(context)));
            await commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: exportObject");
          }).catch(() => {
            window.showErrorMessage('dbFlux: No executable "sql" found on path!');
          });
        }
      }
    } else {
      window.showErrorMessage('dbFlux: Not a schema object selected!');
    }

  });
};

function fileExists(activeFilePath: string):boolean {
 const ret = existsSync(path.format(path.parse(activeFilePath))) || existsSync(path.format(path.parse(ltrim(activeFilePath, '/'))));
 return ret;
}
