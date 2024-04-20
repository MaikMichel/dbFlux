/* eslint-disable @typescript-eslint/naming-convention */
import * as path from "path";

import { AbstractBashTaskProvider, IBashInfos, IProjectInfos } from "./AbstractBashTaskProvider";
import { commands, ExtensionContext, ShellExecution, Task, TaskDefinition, TaskProvider, tasks, TaskScope, Uri, window, workspace } from "vscode";
import { CompileTaskStore, setAppPassword } from "../stores/CompileTaskStore";
import { ConfigurationManager } from "../helper/ConfigurationManager";
import { getActiveFileUri, getRelativePartsFromFile, getWorkingFile, getWorkspaceRootPath, ltrim, matchRuleShort, rtrim } from "../helper/utilities";
import { existsSync } from "fs";


const which = require('which');

interface RemoveTaskDefinition extends TaskDefinition {
  name: string;
  runner: ISQLRemoveInfos;
}

interface ISQLRemoveInfos extends IBashInfos {
  exportFileExt:      string | undefined;
  exportAppID:        string | undefined;
  exportAppPath:      string | undefined;
  exportFileName:     string | undefined;
  executableCli:      string;
}


export class RemoveStaticFileProvider extends AbstractBashTaskProvider implements TaskProvider {
  static dbFluxType: string = "dbFlux";

  provideTasks(): Thenable<Task[]> | undefined {
    return this.getRemoveObjectTask();
  }

  resolveTask(task: Task): Task | undefined {
    return task;
  }


  async getRemoveObjectTask(): Promise<Task[]> {
    const result: Task[] = [];
    const runTask: ISQLRemoveInfos = await this.prepExportInfos();

    result.push(this.createExpTask(this.createExpTaskDefinition("removeCurrentStaticFile", runTask)));


    return Promise.resolve(result);
  }

  createExpTaskDefinition(name: string, runner: ISQLRemoveInfos): RemoveTaskDefinition {
    return {
      type: RemoveStaticFileProvider.dbFluxType,
      name,
      runner,
    };
  }

  createExpTask(definition: RemoveTaskDefinition): Task {
    let _task = new Task(
      definition,
      TaskScope.Workspace,
      definition.name,
      RemoveStaticFileProvider.dbFluxType,
      new ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_SQLCLI:      definition.runner.executableCli,
          DBFLOW_DBTNS:       definition.runner.connectionTns,
          DBFLOW_DBUSER:      definition.runner.connectionUser,
          DBFLOW_DBPASS:      definition.runner.connectionPass,
          DBFLOW_EXP_APP_ID:  definition.runner.exportAppID!,
          DBFLOW_EXP_PATH:    definition.runner.exportAppPath!,
          DBFLOW_EXP_FNAME:   definition.runner.exportFileName!,
          DBFLOW_EXP_FEXT:    definition.runner.exportFileExt!,
          DBFLOW_COLOR_ON:    definition.runner.coloredOutput
        },
      })

    );
    _task.presentationOptions.echo = false;

    return _task;
  }

  async prepExportInfos(): Promise<ISQLRemoveInfos> {
    let runner: ISQLRemoveInfos = {} as ISQLRemoveInfos;

    if (workspace.workspaceFolders) {
      const connectionUri = await getActiveFileUri(this.context);
      const activeFilePath          = connectionUri?.path;

      if (activeFilePath && fileExists(activeFilePath)) {
        const parts:string[] = getRelativePartsFromFile(activeFilePath);
        if (parts[0] === "static") {



          runner.executableCli          = ConfigurationManager.getCliToUseForCompilation();
          runner.exportFileName         = workspace.asRelativePath(connectionUri);

          runner.exportAppPath  = runner.exportFileName.substring(0, runner.exportFileName.indexOf('/src/') + 4);
          runner.exportFileName = runner.exportFileName.replace(runner.exportAppPath+"/", "");
          runner.exportFileExt  = path.parse(runner.exportFileName).ext.substring(1);


          runner.exportAppID    = runner.exportAppPath.replace("/src", "").split("/").pop()?.replace("f", "");

        }
        await this.setInitialCompileInfo("remove_static_file.sh", connectionUri!, runner);

      }


    } else {
      throw "Error workspace.workspaceFolders or schemaName undefined"
    }

    return runner;
  }

}


export function registerRemoveCurrentStaticFileCommand(projectInfos: IProjectInfos, context: ExtensionContext) {
  return commands.registerCommand("dbFlux.removeCurrentStaticFile", async () => {
    // check what file has to build
    let fileName = await getWorkingFile(context);
    const relativeFileName = fileName.replace(getWorkspaceRootPath() + "/", "")


    const insideStatic = matchRuleShort(relativeFileName, 'static/*/src/*');

    if (insideStatic) {
      if (projectInfos.isValid) {
        setAppPassword(projectInfos);

        if (CompileTaskStore.getInstance().appPwd !== undefined) {

          which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
            context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new RemoveStaticFileProvider(context)));
            await commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: removeCurrentStaticFile");
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
