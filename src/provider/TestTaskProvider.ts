/* eslint-disable @typescript-eslint/naming-convention */

import * as vscode from "vscode";
import * as path from "path";

import { getWorkingFile, matchRuleShort } from "../helper/utilities";
import { AbstractBashTaskProvider, getDBSchemaFolders, getDBUserFromPath, getProjectInfos, IBashInfos } from "./AbstractBashTaskProvider";
import { ConfigurationManager } from "../helper/ConfigurationManager";
import { TestTaskStore } from "../stores/TestTaskStore";
import { CompileTaskStore, setAppPassword } from "../stores/CompileTaskStore";
import { outputLog } from "../helper/OutputChannel";


const which = require('which');

interface TestTaskDefinition extends vscode.TaskDefinition {
  name: string;
  runner: ISQLTestInfos;
}

interface ISQLTestInfos extends IBashInfos {
  connectionArray:    string[];
  executableCli:      string;
  fileToTest:         string;
}

export class TestTaskProvider extends AbstractBashTaskProvider implements vscode.TaskProvider {
  static dbFluxType: string = "dbFlux";

  constructor(context: vscode.ExtensionContext, private mode:string){
    super(context);
  };

  provideTasks(): Thenable<vscode.Task[]> | undefined {
    return this.getTestTasks();
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    return task;
  }


  async getTestTasks(): Promise<vscode.Task[]> {
    const result: vscode.Task[] = [];

    const runTask: ISQLTestInfos = await this.prepTestInfos();

    result.push(this.createTestTask(this.createTestTaskDefinition(this.mode, runTask)));

    return Promise.resolve(result);
  }

  createTestTaskDefinition(name: string, runner: ISQLTestInfos): TestTaskDefinition {
    return {
      type: TestTaskProvider.dbFluxType,
      name,
      runner,
    };
  }

  createTestTask(definition: TestTaskDefinition): vscode.Task {
    let _task = new vscode.Task(
      definition,
      vscode.TaskScope.Workspace,
      definition.name,
      TestTaskProvider.dbFluxType,
      new vscode.ShellExecution(definition.runner.runFile, definition.runner.connectionArray, {
        env: {
          DBFLOW_SQLCLI:     definition.runner.executableCli,
          DBFLOW_DBTNS:      definition.runner.connectionTns,
          DBFLOW_DBPASS:     definition.runner.connectionPass,
          DBFLOW_FILE2TEST:  this.mode === "executeTests" ? "" : definition.runner.fileToTest
        }
      })

    );
    _task.presentationOptions.echo = false;


    return _task;
  }

  async prepTestInfos(): Promise<ISQLTestInfos> {
    let runner: ISQLTestInfos = {} as ISQLTestInfos;

    if (vscode.workspace.workspaceFolders) {
      let fileUri:vscode.Uri = vscode.workspace.workspaceFolders[0].uri;
      let apexUri:vscode.Uri = vscode.Uri.file(path.join(fileUri.fsPath, 'apex/f0000/install.sql'));

      if (apexUri !== undefined) {
        this.setInitialCompileInfo("test.sh", apexUri, runner);
        const projectInfos = getProjectInfos(this.context);
        if (TestTaskStore.getInstance().selectedSchemas) {
          runner.connectionArray = TestTaskStore.getInstance().selectedSchemas!.map((element) =>{
            return this.buildConnectionUser(projectInfos, element);
          });
        };

        runner.fileToTest = "" + TestTaskStore.getInstance().fileName;

        runner.executableCli      = ConfigurationManager.getCliToUseForCompilation();

      }
    }

    return runner;
  }

}


export function registerExecuteTestPackageCommand(context: vscode.ExtensionContext) {
  return vscode.commands.registerCommand("dbFlux.executeTestPackage", async () => {
    const projectInfosReloaded = getProjectInfos(context);
    if (projectInfosReloaded.isValid) {

      // check what file has to build
      let fileName = await getWorkingFile();

      // now check connection infos
      setAppPassword(projectInfosReloaded);


      if (CompileTaskStore.getInstance().appPwd !== undefined) {
        // const insidePackages = matchRuleShort(fileName, '*/db/*/sources/packages/*');
        const insideTests = matchRuleShort(fileName, '*/db/*/tests/packages/*');
        const fileExtension: string = "" + fileName.split('.').pop();
        const extensionAllowed = ConfigurationManager.getKnownSQLFileExtensions();


        if (extensionAllowed.map(ext => ext.toLowerCase()).includes(fileExtension.toLowerCase()) && (insideTests)) {
          which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
            TestTaskStore.getInstance().selectedSchemas = ["db/" + getDBUserFromPath(fileName, projectInfosReloaded)];
            TestTaskStore.getInstance().fileName = fileName;
            vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: executeTestPackage");
          }).catch(() => {
            vscode.window.showErrorMessage(`dbFlux: No executable ${ConfigurationManager.getCliToUseForCompilation()} found on path!`);
          });
        } else {
          vscode.window.showWarningMessage('Current filetype is not supported by dbFlux ...');
        }
      }
    }
  });
}

export function registerExecuteTestsTaskCommand(context: vscode.ExtensionContext) {
  return vscode.commands.registerCommand("dbFlux.executeTests", async () => {
    const projectInfosReloaded = getProjectInfos(context);
    if (projectInfosReloaded.isValid) {
      setAppPassword(projectInfosReloaded);

      if (CompileTaskStore.getInstance().appPwd !== undefined) {

        let schemaSelected: boolean = false;
        const dbSchemaFolders = await getDBSchemaFolders();
        if (dbSchemaFolders.length > 1) {

          const items: vscode.QuickPickItem[] | undefined = await vscode.window.showQuickPick(dbSchemaFolders, {
            canPickMany: true, placeHolder: 'Choose Schema to run your tests'
          });
          schemaSelected = (items !== undefined && items?.length > 0);
          TestTaskStore.getInstance().selectedSchemas = items?.map(function (element) { return element.description!; });
        } else if (dbSchemaFolders.length === 1) {
          schemaSelected = true;
          TestTaskStore.getInstance().selectedSchemas = dbSchemaFolders?.map(function (element) { return element.description!; });
        }

        if (schemaSelected) {
          which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
            await vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: executeTests");
          }).catch((error: any) => {
            outputLog(error);
            vscode.window.showErrorMessage(`dbFlux: No executable ${ConfigurationManager.getCliToUseForCompilation()} found on path!`);
          });
        }
      }
    }
  });
}