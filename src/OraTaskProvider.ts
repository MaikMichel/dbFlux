import * as vscode from 'vscode';
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { ConfigurationManager } from './ConfigurationManager';
import { matchRuleShort } from './utilities';

interface OraTaskDefinition extends vscode.TaskDefinition {
  name:   string;
  params: string[];
}

interface ISQLRunnable {
  runFile:          string,
  connectionTns:    string,
  connectionUser:   string,
  connectionPass:   string,
  activeFile:       string,
  relativeWSPath:   string,
  cwd:              string,
  executableCli:    string,
  moveYesNo:        string
}

export class OraTaskProvider implements vscode.TaskProvider {
  static dbFlowType: string = "dbFlow";

  provideTasks(): Thenable<vscode.Task[]> | undefined {
    return getTasks();
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    return task;
  }
}

function getTasks(): Promise<vscode.Task[]> {
  let result: vscode.Task[] = [];
  const runTask: ISQLRunnable = prepareRunnable();
  result.push(createOraTask(createOraTaskDefinition({name: "compileFile",
                                                        params:[
                                                          runTask.runFile,
                                                          runTask.connectionTns,
                                                          runTask.connectionUser,
                                                          runTask.connectionPass,
                                                          runTask.activeFile,
                                                          runTask.relativeWSPath,
                                                          runTask.executableCli,
                                                          runTask.moveYesNo
                                                        ]
                                                    })));

  return Promise.resolve(result);
}


function createOraTaskDefinition({ name, params }:any): OraTaskDefinition {
  return {
    type: OraTaskProvider.dbFlowType,
    name,
    params
  };
}

function createOraTask(definition: OraTaskDefinition): vscode.Task {
  let _task = new vscode.Task(definition, vscode.TaskScope.Workspace,
                              definition.name, OraTaskProvider.dbFlowType,
                              new vscode.ShellExecution(definition.params.join(" ")),
                              ["$oracle-plsql"]);
  _task.presentationOptions.echo = false;
  return _task;
}


function prepareRunnable():ISQLRunnable {
  let runner:ISQLRunnable = {} as ISQLRunnable;

  if (vscode.window.activeTextEditor !== undefined) {
    runner.runFile        = path.resolve(__dirname, "..", "out", "deploy.sh").split(path.sep).join('/');
    runner.activeFile     = vscode.window.activeTextEditor?.document.fileName.split(path.sep).join('/');
    runner.cwd            = path.dirname(vscode.window.activeTextEditor?.document.fileName);
    runner.relativeWSPath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor?.document.uri!);
    runner.executableCli  = ConfigurationManager.getInstance().sqlExecutable;
    runner.moveYesNo      = "NO";

    // if we are on static and a file with runner.activeFile.sql exists then we are uploading to
    // apex and hopefully build the sql file ...
    if (matchRuleShort(runner.activeFile, '*/static/f*/src*') && fs.existsSync(runner.activeFile+".sql")) {
      runner.activeFile += ".sql";
      runner.moveYesNo = "YES";
    }

    const applyEnv = dotenv.config({path: findClosestEnvFile(runner.cwd, 'apply.env')});
    const buildEnv = dotenv.config({path: findClosestEnvFile(runner.cwd, 'build.env')});


    runner.connectionTns  = applyEnv.parsed?.DB_TNS!;
    runner.connectionUser = buildConnectionUser(applyEnv, buildEnv, runner.cwd);
    runner.connectionPass = applyEnv.parsed?.DB_APP_PWD!;

  }

  return runner;
}


function findClosestEnvFile(pathname: string, filename: string): string | undefined {
  let file      = path.join(pathname, filename);
  let filePath  = pathname;

  if (vscode.workspace.workspaceFolders !== undefined) {
    const wsf = vscode.workspace.workspaceFolders[0].uri.fsPath;
    let i = 0;

    while (i < 10 && ((file.indexOf(wsf) < 0) || !fs.existsSync(file))) {
      i++;
      const folders = filePath.split(path.sep);
      folders.pop();
      filePath = folders.join(path.sep);
      file = path.join(filePath, filename);
    }
  } else {
    throw new Error("not workspacefolder opened");
  }

  if (!fs.existsSync(file)) {
    throw new Error(filename + " not found");
  }

  return file;
}

function getDBUserFromPath(pathName:string, buildEnv: dotenv.DotenvConfigOutput): string {
  let returnDBUser:string = (buildEnv.parsed?.APP_SCHEMA!).toLowerCase(); // sql File inside static or rest
  if (pathName.includes('db'+path.sep+(buildEnv.parsed?.DATA_SCHEMA!).toLowerCase())) {
    returnDBUser = (buildEnv.parsed?.DATA_SCHEMA!).toLowerCase();
  } else if (pathName.includes('db'+path.sep+(buildEnv.parsed?.LOGIC_SCHEMA!).toLowerCase())) {
    returnDBUser = (buildEnv.parsed?.LOGIC_SCHEMA!).toLowerCase();
  } else if (pathName.includes('db'+path.sep+(buildEnv.parsed?.APP_SCHEMA!).toLowerCase())) {
    returnDBUser = (buildEnv.parsed?.APP_SCHEMA!).toLowerCase();
  }
  return returnDBUser;
}

// TODO: Validate existence of vars
function buildConnectionUser(applyEnv: dotenv.DotenvConfigOutput, buildEnv: dotenv.DotenvConfigOutput, currentPath: string): string {
  if (applyEnv.parsed?.USE_PROXY === 'FALSE') {
    return `${applyEnv.parsed.DB_APP_USER}`;
  } else {
    let dbSchemaFolder = getDBUserFromPath(currentPath, buildEnv);

    return `${applyEnv.parsed?.DB_APP_USER}[${dbSchemaFolder}]`;
  }
}
