
import * as path from "path";

import { AbstractBashTaskProvider, getProjectInfos, IBashInfos, IProjectInfos } from "./AbstractBashTaskProvider";
import { assertRestApiLevel } from "../helper/RestApiUtils";
import { commands, ExtensionContext, ShellExecution, Task, TaskDefinition, TaskProvider, tasks, TaskScope, window, workspace } from "vscode";
import { CompileTaskStore, setAppPassword } from "../stores/CompileTaskStore";
import { ConfigurationManager } from "../helper/ConfigurationManager";
import { getActiveFileUri, getRelativePartsFromFile, getWorkingFile, getWorkspaceRootPath, ltrim, matchRuleShort } from "../helper/utilities";
import { existsSync } from "fs";

// eslint-disable-next-line @typescript-eslint/no-require-imports
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
    const _task = new Task(
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
          DBFLOW_COLOR_ON:    definition.runner.coloredOutput,
          ...this.getRestEnv(definition.runner)
        },
      })

    );
    _task.presentationOptions.echo = false;

    return _task;
  }

  async prepExportInfos(): Promise<ISQLRemoveInfos> {
    const runner: ISQLRemoveInfos = {} as ISQLRemoveInfos;

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
        const projectInfos = await getProjectInfos(this.context);
        await this.setInitialCompileInfo(projectInfos.dbConnMode === "REST" ? "rest_remove_static_file.sh" : "remove_static_file.sh", connectionUri!, runner);

      }


    } else {
      throw new Error("workspace.workspaceFolders or schemaName is undefined");
    }

    return runner;
  }

}


export function registerRemoveCurrentStaticFileCommand(projectInfos: IProjectInfos, context: ExtensionContext) {
  return commands.registerCommand("dbFlux.removeCurrentStaticFile", async () => {
    // check what file has to build
    const fileName = await getWorkingFile(context);
    const relativeFileName = fileName.replace(getWorkspaceRootPath() + "/", "");


    const insideStatic = matchRuleShort(relativeFileName, 'static/*/src/*');

    if (insideStatic) {
      if (projectInfos.isValid) {
        setAppPassword(projectInfos);

        if (CompileTaskStore.getInstance().appPwd !== undefined) {

          if (projectInfos.dbConnMode === "REST" && !(await assertRestApiLevel(projectInfos, "Remove Static File"))) {
            return;
          }

          const cliCheck: Promise<unknown> = projectInfos.dbConnMode === "REST"
            ? Promise.resolve()
            : which(ConfigurationManager.getCliToUseForCompilation());

          cliCheck.then(async () => {
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
