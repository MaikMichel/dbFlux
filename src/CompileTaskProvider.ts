/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ConfigurationManager } from "./ConfigurationManager";
import { getActiveFileUri, getStaticReference, groupByKey, matchRuleShort } from "./utilities";
import { AbstractBashTaskProvider, IBashInfos } from "./AbstractBashTaskProvider";


interface OraTaskDefinition extends vscode.TaskDefinition {
  name:   string;
  runner: ICompileInfos;
}

interface ICompileInfos extends IBashInfos {
  activeFile:         string;
  relativeWSPath:     string;
  executableCli:      string;
  moveYesNo:          string;
  enableWarnings:     string;
  dataConn:           string;
  dataFile:           string;
  logicConn:          string;
  logicFile:          string;
  appConn:            string;
  appFile:            string;
  coloredOutput:      string;
  additionalOutput:   string;
}

export class CompileTaskProvider extends AbstractBashTaskProvider implements vscode.TaskProvider {


  provideTasks(): Thenable<vscode.Task[]> | undefined {
    return this.getCompileTasks();
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    return task;
  }

  async getCompileTasks(): Promise<vscode.Task[]> {
    const result: vscode.Task[] = [];

    const compileTask: ICompileInfos = await this.prepCompInfos();

    if (compileTask.activeFile) {
      result.push(this.createOraTask(this.createOraTaskDefinition("compileFile", compileTask)));
    }

    return Promise.resolve(result);
  }

  createOraTaskDefinition(name: string, runner: ICompileInfos): OraTaskDefinition {
    return {
      type: CompileTaskProvider.dbFluxType,
      name,
      runner,
    };
  }

  createOraTask(definition: OraTaskDefinition): vscode.Task {
    let _task = new vscode.Task(
      definition,
      vscode.TaskScope.Workspace,
      definition.name,
      CompileTaskProvider.dbFluxType,
      new vscode.ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_DBTNS:             definition.runner.connectionTns,
          DBFLOW_DBUSER:            definition.runner.connectionUser,
          DBFLOW_DBPASS:            definition.runner.connectionPass,
          DBFLOW_FILE:              definition.runner.activeFile,
          DBFLOW_WSPACE:            definition.runner.relativeWSPath,
          DBFLOW_SQLCLI:            definition.runner.executableCli,
          DBFLOW_MOVEYN:            definition.runner.moveYesNo,
          DBFLOW_ENABLE_WARNINGS:   definition.runner.enableWarnings,
          DBFLOW_ADDITIONAL_OUTOUT: definition.runner.additionalOutput,

          DBFLOW_CONN_DATA:         definition.runner.dataConn,
          DBFLOW_CONN_LOGIC:        definition.runner.logicConn,
          DBFLOW_CONN_APP:          definition.runner.appConn,

          DBFLOW_FILE_DATA:         definition.runner.dataFile,
          DBFLOW_FILE_LOGIC:        definition.runner.logicFile,
          DBFLOW_FILE_APP:          definition.runner.appFile,

          DBFLOW_COLOR_ON:          definition.runner.coloredOutput
        },
      }),
      ["$dbflux-plsql"]
    );
    _task.presentationOptions.echo = false;
    _task.presentationOptions.focus = true;
    return _task;
  }


  async prepCompInfos(): Promise<ICompileInfos> {
    let runner: ICompileInfos = {} as ICompileInfos;
    let fileUri:vscode.Uri|undefined = await getActiveFileUri();

    if (fileUri !== undefined) {
      this.setInitialCompileInfo("deploy.sh", fileUri, runner);


      runner.activeFile         = fileUri.fsPath.split(path.sep).join(path.posix.sep);
      runner.relativeWSPath     = vscode.workspace.asRelativePath(runner.activeFile);
      runner.executableCli      = ConfigurationManager.getCliToUseForCompilation();
      runner.moveYesNo          = "NO";
      runner.coloredOutput      = "" + ConfigurationManager.getShowWarningsAndErrorsWithColoredOutput();


      if (ConfigurationManager.getShowWarningMessages()) {
        const excluding = ConfigurationManager.getWarningsToExclude().join(", ");
        runner.enableWarnings = `ALTER SESSION SET PLSQL_WARNINGS = 'ENABLE:ALL', 'DISABLE:(${excluding})';`;
      } else {
        runner.enableWarnings = "";
      }

      // if we are on static and a file with runner.activeFile.sql exists then we are uploading to
      // apex and hopefully build the sql file ...
      if (matchRuleShort(runner.activeFile, "*/static/f*/src*") && fs.existsSync(runner.activeFile + ".sql")) {
        runner.activeFile += ".sql";
        runner.moveYesNo = "YES";
        runner.additionalOutput = "Reference file by using: " + getStaticReference(runner.activeFile);
      }



      if (matchRuleShort(runner.connectionPass, "${*}") || matchRuleShort(runner.connectionUser, "${*}") || matchRuleShort(runner.connectionPass, "${*}")) {
        vscode.window.showErrorMessage("dbFlux: Sourcing or parameters not supported");
        throw new Error("dbFlux: Sourcing or parameters not supported");
      }

      // Trigger?
      this.setCustomTriggerRuns(runner);

    }

    return runner;
  }

  setCustomTriggerRuns(compInfos: ICompileInfos): void {
    let myList:any[] = [];

    ConfigurationManager.getCustomTriggerRuns().forEach((runner)=>{
      if (compInfos.activeFile.match(runner.triggeringExpression)) {
        const obj = {
          "connection": this.getConnection(compInfos.projectInfos, runner.runFile),
          "file": '@' + runner.runFile + ((runner.runFileParameters) ? " " + runner.runFileParameters.map((item)=>`"${item}"`) .join(" ") : "")
        };
        myList.push(obj);
      }
    });

    const myGroupedList = groupByKey(myList, "connection");


    Object.keys(myGroupedList).forEach((key: any) => {
      const connType = this.getConnectionType(key, compInfos);

      // const files = myGroupedList[key].map((obj: { file: string; }) => obj.file).join(` "${compInfos.relativeWSPath}",`) + ` "${compInfos.relativeWSPath}"`;
      const files = myGroupedList[key].map((obj: { file: string; }) => obj.file).join(",");
      if ( connType === CompileTaskProvider.CONN_DATA) {
        compInfos.dataConn = key;
        compInfos.dataFile = files;
      } else if ( connType === CompileTaskProvider.CONN_LOGIC) {
        compInfos.logicConn = key;
        compInfos.logicFile = files;
      } else if ( connType === CompileTaskProvider.CONN_APP) {
        compInfos.appConn = key;
        compInfos.appFile = files;
      }

    });

  }


}
