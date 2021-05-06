/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { ConfigurationManager } from "./ConfigurationManager";
import { matchRuleShort } from "./utilities";
import { AbstractBashTaskProvider, IBashInfos } from "./AbstractBashTaskProvider";

interface OraTaskDefinition extends vscode.TaskDefinition {
  name:   string;
  runner: ICompileInfos;
}

interface ICompileInfos extends IBashInfos {
  activeFile:     string;
  relativeWSPath: string;
  executableCli:  string;
  moveYesNo:      string;
}

export class CompileTaskProvider extends AbstractBashTaskProvider implements vscode.TaskProvider {
  static dbFlowType: string = "dbFlow";

  provideTasks(): Thenable<vscode.Task[]> | undefined {
    return this.getCompileTasks();
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    return task;
  }

  async getCompileTasks(): Promise<vscode.Task[]> {
    const result: vscode.Task[] = [];

    const compileTask: ICompileInfos = this.prepCompInfos();

    if (compileTask.activeFile) {
      result.push(this.createOraTask(this.createOraTaskDefinition("compileFile", compileTask)));
    }

    return Promise.resolve(result);
  }

  createOraTaskDefinition(name: string, runner: ICompileInfos): OraTaskDefinition {
    return {
      type: CompileTaskProvider.dbFlowType,
      name,
      runner,
    };
  }

  createOraTask(definition: OraTaskDefinition): vscode.Task {
    let _task = new vscode.Task(
      definition,
      vscode.TaskScope.Workspace,
      definition.name,
      CompileTaskProvider.dbFlowType,
      new vscode.ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_DBTNS: definition.runner.connectionTns,
          DBFLOW_DBUSER: definition.runner.connectionUser,
          DBFLOW_DBPASS: definition.runner.connectionPass,
          DBFLOW_FILE: definition.runner.activeFile,
          DBFLOW_WSPACE: definition.runner.relativeWSPath,
          DBFLOW_SQLCLI: definition.runner.executableCli,
          DBFLOW_MOVEYN: definition.runner.moveYesNo,
        },
      }),
      ["$dbflow-plsql"]
    );
    _task.presentationOptions.echo = false;
    return _task;
  }


  prepCompInfos(): ICompileInfos {
    let runner: ICompileInfos = {} as ICompileInfos;

    if (vscode.window.activeTextEditor !== undefined) {

      runner.runFile        = path.resolve(__dirname, "..", "dist", "deploy.sh").split(path.sep).join("/");
      runner.activeFile     = vscode.window.activeTextEditor?.document.fileName.split(path.sep).join("/");
      runner.cwd            = path.dirname(vscode.window.activeTextEditor?.document.fileName);
      runner.relativeWSPath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor?.document.uri!);
      runner.executableCli  = ConfigurationManager.getInstance().sqlExecutable;
      runner.moveYesNo      = "NO";

      // if we are on static and a file with runner.activeFile.sql exists then we are uploading to
      // apex and hopefully build the sql file ...
      if (matchRuleShort(runner.activeFile, "*/static/f*/src*") && fs.existsSync(runner.activeFile + ".sql")) {
        runner.activeFile += ".sql";
        runner.moveYesNo = "YES";
      }

      const applyEnv = dotenv.config({ path: this.findClosestEnvFile(runner.cwd, "apply.env") });
      const buildEnv = dotenv.config({ path: this.findClosestEnvFile(runner.cwd, "build.env") });

      if (applyEnv.parsed !== undefined) {
        runner.connectionTns = applyEnv.parsed.DB_TNS.length > 0 ? applyEnv.parsed.DB_TNS : "not_set";
        runner.connectionUser = this.buildConnectionUser(applyEnv, buildEnv, runner.cwd);
        runner.connectionPass = applyEnv.parsed.DB_APP_PWD.length > 0 ? applyEnv.parsed.DB_APP_PWD : "not_set";

        if (matchRuleShort(runner.connectionPass, "${*}") || matchRuleShort(runner.connectionUser, "${*}") || matchRuleShort(runner.connectionPass, "${*}")) {
          vscode.window.showErrorMessage("dbFlow: Sourcing or parameters not supported");
          throw new Error("dbFlow: Sourcing or parameters not supported");
        }
      } else {
        vscode.window.showErrorMessage("dbFlow: Could not parse apply.env");
        throw new Error("dbFlow: Could not parse apply.env");
      }
    }

    return runner;
  }
}
