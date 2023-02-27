/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as path from "path";

import { AbstractBashTaskProvider, getProjectInfos, IBashInfos } from "./AbstractBashTaskProvider";
import { ConfigurationManager } from "../helper/ConfigurationManager";
import { CompileTaskStore } from "../stores/CompileTaskStore";


interface CompileSchemaTaskDefinition extends vscode.TaskDefinition {
  name: string;
  runner: ISQLCompileInfos;
}

interface ISQLCompileInfos extends IBashInfos {
  connectionArray:    string[];
  executableCli:      string;
  enableWarnings:     string;
  sqlWarningString:   string;
  sqlWarningExcList:  string;
  sqlCompileOption:   string;
}

export class CompileSchemasProvider extends AbstractBashTaskProvider implements vscode.TaskProvider {
  static dbFluxType: string = "dbFlux";

  constructor(context: vscode.ExtensionContext, private mode:string, private compileOption: string){
    super(context);
  };

  provideTasks(): Thenable<vscode.Task[]> | undefined {
    return this.getCompileSchemaTask();
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    return task;
  }


  async getCompileSchemaTask(): Promise<vscode.Task[]> {
    const result: vscode.Task[] = [];

    result.push(this.createCompileSchemaTask(this.createCompileSchemaTaskDefinition(this.mode, await this.prepTestInfos())));

    return Promise.resolve(result);
  }

  createCompileSchemaTaskDefinition(name: string, runner: ISQLCompileInfos): CompileSchemaTaskDefinition {
    return {
      type: CompileSchemasProvider.dbFluxType,
      name,
      runner,
    };
  }

  createCompileSchemaTask(definition: CompileSchemaTaskDefinition): vscode.Task {
    let _task = new vscode.Task(
      definition,
      vscode.TaskScope.Workspace,
      definition.name,
      CompileSchemasProvider.dbFluxType,
      new vscode.ShellExecution(definition.runner.runFile, definition.runner.connectionArray, {
        env: {
          DBFLOW_SQLCLI:     definition.runner.executableCli,
          DBFLOW_DBTNS:      definition.runner.connectionTns,
          DBFLOW_DBPASS:     definition.runner.connectionPass,

          DBFLOW_COLOR_ON:          definition.runner.coloredOutput,
          DBFLOW_ENABLE_WARNINGS:   definition.runner.enableWarnings,
          DBFLOW_SQL_WARNING_STRING:  definition.runner.sqlWarningString?definition.runner.sqlWarningString:"NIX",
          DBFLOW_SQL_WARNING_EXCLUDE: definition.runner.sqlWarningExcList?definition.runner.sqlWarningExcList:"0",
          DBFLOW_SQL_COMPILE_OPTION: definition.runner.sqlCompileOption==="Invalid"?"false":"true"
        }
      }),
      ["$dbflux-plsql-all"]
    );
    _task.presentationOptions.echo = false;
    _task.presentationOptions.focus = true;

    return _task;
  }

  async prepTestInfos(): Promise<ISQLCompileInfos> {
    let runner: ISQLCompileInfos = {} as ISQLCompileInfos;

    if (vscode.workspace.workspaceFolders) {
      let fileUri:vscode.Uri = vscode.workspace.workspaceFolders[0].uri;
      let apexUri:vscode.Uri = vscode.Uri.file(path.join(fileUri.fsPath, 'apex/f0000/install.sql'));

      if (apexUri !== undefined) {
        this.setInitialCompileInfo("compile.sh", apexUri, runner);
        const projectInfos = getProjectInfos(this.context);
        if (CompileTaskStore.getInstance().selectedSchemas) {
          runner.connectionArray = CompileTaskStore.getInstance().selectedSchemas!.map((element) =>{
            return '"' + this.buildConnectionUser(projectInfos, element) + '"';
          });
        };

        runner.executableCli      = ConfigurationManager.getCliToUseForCompilation();
        runner.sqlCompileOption   = this.compileOption;

        if (ConfigurationManager.getShowWarningMessages()) {
          const excluding = ConfigurationManager.getWarningsToExclude().join(", ");
          runner.enableWarnings = `ALTER SESSION SET PLSQL_WARNINGS = 'ENABLE:ALL', 'DISABLE:(${excluding})';`;
          runner.sqlWarningString = 'WARNING';
          runner.sqlWarningExcList = excluding;
        } else {
          runner.enableWarnings = "";
        }

      }
    }

    return runner;
  }

}
