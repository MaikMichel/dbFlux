/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as path from "path";

import { matchRuleShort } from "./utilities";
import { AbstractBashTaskProvider, IBashInfos } from "./AbstractBashTaskProvider";
import { ConfigurationManager } from "./ConfigurationManager";
import { TestTaskStore } from "./TestTaskStore";


interface TestTaskDefinition extends vscode.TaskDefinition {
  name: string;
  runner: ISQLTestInfos;
}

interface ISQLTestInfos extends IBashInfos {
  dataConn:           string;
  logicConn:          string;
  appConn:            string;
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
      new vscode.ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_SQLCLI:     definition.runner.executableCli,
          DBFLOW_CONN_DATA:  definition.runner.dataConn,
          DBFLOW_CONN_LOGIC: definition.runner.logicConn,
          DBFLOW_CONN_APP:   definition.runner.appConn,
          DBFLOW_FILE2TEST:  this.mode === "executeTests" ? "" : definition.runner.fileToTest
        },
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
        if (runner.projectInfos.useProxy) {


          if (TestTaskStore.getInstance().selectedSchemas?.includes(runner.projectInfos.dataSchema)) {
            runner.dataConn = `${runner.projectInfos.dbAppUser}[${runner.projectInfos.dataSchema}]/${runner.connectionPass}@${runner.connectionTns}`;
          }

          if (TestTaskStore.getInstance().selectedSchemas?.includes(runner.projectInfos.logicSchema)) {
            runner.logicConn = `${runner.projectInfos.dbAppUser}[${runner.projectInfos.logicSchema}]/${runner.connectionPass}@${runner.connectionTns}`;
          }

          if (TestTaskStore.getInstance().selectedSchemas?.includes(runner.projectInfos.appSchema)) {
            runner.appConn = `${runner.projectInfos.dbAppUser}[${runner.projectInfos.appSchema}]/${runner.connectionPass}@${runner.connectionTns}`;
          }

        } else {
          runner.appConn = `${runner.projectInfos.dbAppUser}/${runner.connectionPass}@${runner.connectionTns}`;
        }


        runner.fileToTest = "" + TestTaskStore.getInstance().fileName;

        runner.executableCli      = ConfigurationManager.getCliToUseForCompilation();

      }
    }

    return runner;
  }

}
