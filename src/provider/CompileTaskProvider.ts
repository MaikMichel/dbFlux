/* eslint-disable @typescript-eslint/naming-convention */

import * as fs from "fs";
import * as path from "path";
import { ConfigurationManager, focusProblemPanel } from "../helper/ConfigurationManager";
import { getActiveFileUri, getStaticReference, getWorkingFile, getWorkspaceRootPath, matchRuleShort, rtrim } from "../helper/utilities";
import { AbstractBashTaskProvider, buildConnectionUser, getDBSchemaFolders, IBashInfos, IProjectInfos } from "./AbstractBashTaskProvider";
import { CompileTaskStore, setAdminPassword, setAdminUserName, setAppPassword } from "../stores/CompileTaskStore";
import { commands, ExtensionContext, QuickPickItem, ShellExecution, Task, TaskDefinition, TaskProvider, tasks, TaskScope, Uri, window, workspace } from "vscode";
import { Terserer } from "../templaters/Terserer";
import { Uglifyer } from "../templaters/Uglifyer";
import { SimpleUploader } from "../templaters/SimpleUploader";
import { ReportTemplater } from "../templaters/ReportTemplater";
import fetch from "node-fetch";
import { outputLog } from "../helper/OutputChannel";
import { CompileSchemasProvider } from "./CompileSchemasProvider";


const which = require('which');

interface OraTaskDefinition extends TaskDefinition {
  name:   string;
  runner: ICompileInfos;
}

interface ILockedFile {
  isLocked:boolean
  user:string
}

interface ICompileInfos extends IBashInfos {
  activeFile:         string;
  relativeWSPath:     string;
  executableCli:      string;
  moveYesNo:          string;
  enableWarnings:     string;
  trgRunsConn:        string;
  trgRunsFile:        string;
  trgCallsConn:       string;
  trgCallsMethod:     string;
  trgCallsTFile:      string;
  additionalOutput:   string;
  mode:               CompileMode;
  useSQLErrorLog:     string;
}

export enum CompileMode {
  default,
  triggerOnly,
  handleCallsOnly

}

export class CompileTaskProvider extends AbstractBashTaskProvider implements TaskProvider {
  mode: CompileMode;
  commandKey: string = "compileFile"

  constructor(context: ExtensionContext, mode:CompileMode = CompileMode.default) {
    super(context);
    this.mode = mode;

    if (mode === CompileMode.handleCallsOnly) {
      this.commandKey = 'runHandlebarJSResultsForCurrentFile';
    } else if (mode === CompileMode.triggerOnly) {
      this.commandKey = 'runTriggerForCurrentFile';
    }

  }

  provideTasks(): Thenable<Task[]> | undefined {
    return this.getCompileTasks();
  }

  resolveTask(task: Task): Task | undefined {
    return task;
  }

  async getCompileTasks(): Promise<Task[]> {
    const result: Task[] = [];

    const compileTask: ICompileInfos = await this.prepCompInfos();

    if (compileTask.activeFile) {
      result.push(this.createOraTask(this.createOraTaskDefinition(this.commandKey, compileTask)));
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

  createOraTask(definition: OraTaskDefinition): Task {
    let _task = new Task(
      definition,
      TaskScope.Workspace,
      definition.name,
      CompileTaskProvider.dbFluxType,
      new ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_DBTNS:             definition.runner.connectionTns,
          DBFLOW_DBUSER:            definition.runner.connectionUser,
          DBFLOW_DBPASS:            definition.runner.connectionPass,
          DBFLOW_FILE:              definition.runner.activeFile,
          DBFLOW_WSPACE:            definition.runner.relativeWSPath,
          DBFLOW_SQLCLI:            definition.runner.executableCli,
          DBFLOW_MOVEYN:            definition.runner.moveYesNo,
          DBFLOW_ENABLE_WARNINGS:   definition.runner.enableWarnings,
          DBFLOW_ADDITIONAL_OUTPUT: definition.runner.additionalOutput,

          DBFLOW_TRIGGER_ONLY:      this.mode === CompileMode.triggerOnly ? "YES" : "NO",
          DBFLOW_CONN_RUNS:         definition.runner.trgRunsConn,
          DBFLOW_FILE_RUNS:         definition.runner.trgRunsFile,

          DBFLOW_CONN_CALLS:        definition.runner.trgCallsConn,
          DBFLOW_METHOD_CALLS:      definition.runner.trgCallsMethod,
          DBFLOW_METHOD_TFILES:     definition.runner.trgCallsTFile,

          DBFLOW_COLOR_ON:          definition.runner.coloredOutput,
          DBFLOW_USE_SLOG:          definition.runner.useSQLErrorLog
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
    let fileUri:Uri|undefined = await getActiveFileUri();

    if (fileUri !== undefined) {
      this.setInitialCompileInfo("deploy.sh", fileUri, runner);


      runner.activeFile         = fileUri.fsPath.split(path.sep).join(path.posix.sep);
      runner.relativeWSPath     = workspace.asRelativePath(runner.activeFile);
      runner.executableCli      = ConfigurationManager.getCliToUseForCompilation();
      runner.useSQLErrorLog     = ConfigurationManager.getUseSQLplusSPERRORLOGTable()?"YES":"NO";
      runner.moveYesNo          = "NO";


      if (ConfigurationManager.getShowWarningMessages()) {
        const excluding = ConfigurationManager.getWarningsToExclude().join(", ");
        runner.enableWarnings = `ALTER SESSION SET PLSQL_WARNINGS = 'ENABLE:ALL', 'DISABLE:(${excluding})';`;
      } else {
        runner.enableWarnings = "";
      }

      // if we are on static and a file with runner.activeFile.sql exists then we are uploading to
      // apex and hopefully build the sql file ...
      if (matchRuleShort(runner.activeFile, runner.projectInfos.isFlexMode?'*/static/*/*/f*/src/*':'*/static/f*/src/*') && fs.existsSync(runner.activeFile + ".sql")) {
        runner.activeFile += ".sql";
        runner.moveYesNo = "YES";
        runner.additionalOutput = "Reference file by using: " + getStaticReference(runner.activeFile, runner.projectInfos.isFlexMode);
      }



      if (matchRuleShort(runner.connectionPass, "${*}") || matchRuleShort(runner.connectionUser, "${*}") || matchRuleShort(runner.connectionPass, "${*}")) {
        window.showErrorMessage("dbFlux: Sourcing or parameters not supported");
        throw new Error("dbFlux: Sourcing or parameters not supported");
      }

      // Trigger?
      this.setCustomTriggerRuns(runner);

      // Calls?
      this.setCustomTriggerCalls(runner);
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

    compInfos.trgRunsConn = myList.map((elem)=>elem.connection).join(',');
    compInfos.trgRunsFile = myList.map((elem)=>elem.file).join(',');
  }

  setCustomTriggerCalls(compInfos: ICompileInfos): void {
    let myList:any[] = [];

    ConfigurationManager.getCustomTriggerCalls().forEach((runner)=>{
      if (compInfos.activeFile.match(runner.triggeringExpression)) {
        const obj = {
          "connection": this.getConnection(compInfos.projectInfos, runner.runMethodTargetFile),
          "method": runner.runMethod,
          "tfile": runner.runMethodTargetFile
        };
        myList.push(obj);
      }
    });

    compInfos.trgCallsConn = myList.map((elem)=>elem.connection).join('°');
    compInfos.trgCallsMethod = myList.map((elem)=>elem.method).join('°');
    compInfos.trgCallsTFile = myList.map((elem)=>elem.tfile).join('°');
  }

}


export function registerCompileSchemasCommand(projectInfos: IProjectInfos, context: ExtensionContext) {
  return commands.registerCommand("dbFlux.compileSchemas", async () => {

    if (projectInfos.isValid) {
      setAppPassword(projectInfos);

      if (CompileTaskStore.getInstance().appPwd !== undefined) {

        let schemaSelected: boolean = false;
        const dbSchemaFolders = await getDBSchemaFolders();
        if (dbSchemaFolders.length > 1) {

          // preselect folders/schemas
          dbSchemaFolders.forEach((v)=>{
            v.picked = true;
          })

          const items: QuickPickItem[] | undefined = await window.showQuickPick(dbSchemaFolders, {
            canPickMany: true, placeHolder: 'Choose Schema to compile'
          });

          schemaSelected = (items !== undefined && items?.length > 0);
          CompileTaskStore.getInstance().selectedSchemas = items?.map(function (element) { return element.description!; });
        } else if (dbSchemaFolders.length === 1) {
          schemaSelected = true;
          CompileTaskStore.getInstance().selectedSchemas = dbSchemaFolders?.map(function (element) { return element.description!; });
        }

        if (schemaSelected) {
          const options = [{label:"Invalid", description: "Only invalid object will be compiled"},{label:"All", description: "All objects will be compiled"}];
          const compileOption: QuickPickItem | undefined = await window.showQuickPick(options, {
            canPickMany: false, placeHolder: 'Compile all or just the invalide ones'
          });


          if (compileOption != undefined) {

            which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
              context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new CompileSchemasProvider(context, "compileSchemas", compileOption.label)));
              await commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileSchemas");
            }).catch(() => {
              window.showErrorMessage(`dbFlux: No executable ${ConfigurationManager.getCliToUseForCompilation()} found on path!`);
            });
          }
        }
      }
    }
  });
}

export function registerCompileFileCommand(projectInfos: IProjectInfos, context: ExtensionContext, mode:CompileMode = CompileMode.default) {


  let commandKey = 'dbFlux.compileFile';
  if (mode === CompileMode.handleCallsOnly) {
    commandKey = 'dbFlux.runHandlebarJSResultsForCurrentFile';
  } else if (mode === CompileMode.triggerOnly) {
    commandKey = 'dbFlux.runTriggerForCurrentFile';
  }

  return commands.registerCommand(commandKey, async () => {
    console.log('taskMap', CompileTaskStore.getInstance().taskMap);

    // save file
    let fileUri:Uri|undefined = window.activeTextEditor?.document.uri;
    if (fileUri !== undefined) {
      await window.activeTextEditor?.document.save();
    }

    // get current config
    const compTaskStoreInstance = CompileTaskStore.getInstance();
    const dbLockService = ConfigurationManager.isDBLockEnabled();

    if (projectInfos.isValid) {

      // check what file has to build
      let fileName = await getWorkingFile();
      const relativeFileName = fileName.replace(getWorkspaceRootPath() + "/", "")


      const insideSetup = (matchRuleShort(relativeFileName, 'db/_setup/*') || matchRuleShort(relativeFileName, 'db/.setup/*'));
      const insideDb = !insideSetup && matchRuleShort(relativeFileName, 'db/*');
      const insideStatics = matchRuleShort(relativeFileName, projectInfos.isFlexMode ? 'static/*/*/f*/src/*' : 'static/f*/src/*');
      const insideReports = matchRuleShort(relativeFileName, 'reports/*');
      const insideAPEX = matchRuleShort(relativeFileName, 'apex/*');
      const insideREST = matchRuleShort(relativeFileName, 'rest/*');
      const fileExtension: string = "" + relativeFileName.split('.').pop();
      const extensionAllowed = ConfigurationManager.getKnownSQLFileExtensions();

      // Set password and userinfo to taskStore
      if (insideSetup) {
        await setAdminUserName(projectInfos);
        await setAdminPassword(projectInfos);
      } else {
        await setAppPassword(projectInfos);
      }

      if ((insideSetup
        && (compTaskStoreInstance.adminPwd !== undefined
          && compTaskStoreInstance.adminUser !== undefined))
        || (!insideSetup
          && (compTaskStoreInstance.appPwd !== undefined))) {

        which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {


          let compilable = true;
          if (dbLockService) {
            try {
              const locked:ILockedFile = await isfileLockedByAnotherUser(projectInfos.projectName!, relativeFileName);
              const currentUser = process.env.username?process.env.username:"none";
              console.log('currentUser', currentUser);
              if (locked.isLocked && locked.user !== currentUser) {
                compilable = false;
                await window.showWarningMessage(`File is locked by User ${locked.user}. You have to unlock the file first!`);
                // await window.showInformationMessage(`File is locked by User ${locked.user}. Compile anyway?`, "Yes", "No").then(answer => {
                //    compilable = (answer === "Yes");
                // });
              }
            } catch (e:any) {
                console.error(e);
                await window.showErrorMessage(`dbFlux (dbLock): ${e}!`);
            }
          }

          if (compilable) {
            if (!CompileTaskStore.getInstance().taskMap.has(mode)) {
              CompileTaskStore.getInstance().taskMap.set(mode, new CompileTaskProvider(context, mode));
            }
            context.subscriptions.push(tasks.registerTaskProvider("dbFlux", CompileTaskStore.getInstance().taskMap.get(mode)!));

            if (extensionAllowed.map(ext => ext.toLowerCase()).includes(fileExtension.toLowerCase()) && (insideSetup || insideDb || insideREST || insideAPEX)) {

              // call the compile Task itself
              commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");

              // when configured, the problem panel will be focused
              focusProblemPanel();

            } else if (insideStatics && ['js'].includes(fileExtension.toLowerCase())) {
              // Minify and create JS-Maps when needed
              const tersered = new Terserer(fileName, projectInfos.isFlexMode);
              const success = await tersered.genFile();
              if (success) {
                commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
              } else {
                window.showErrorMessage("dbFlux/terser: " + tersered.getLastErrorMessage());
              }
            } else if (insideStatics && ['css'].includes(fileExtension.toLowerCase())) {
              // Minify CSS
              const uglifyer = new Uglifyer(fileName, projectInfos.isFlexMode);
              uglifyer.genFile();
              commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
            } else if (insideStatics) {
              // Otherwise (not JS or CSS) simple upload the file
              const simpleUploader = new SimpleUploader(fileName, projectInfos.isFlexMode);
              simpleUploader.genFile();
              commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
            } else if (insideReports && !extensionAllowed.map(ext => ext.toLowerCase()).includes(fileExtension.toLowerCase())) {
              const reportTemplater = new ReportTemplater(fileName);
              reportTemplater.genFile();
            } else if (insideReports || !(insideDb || insideREST || insideAPEX || insideSetup || insideStatics) && extensionAllowed.map(ext => ext.toLowerCase()).includes(fileExtension.toLowerCase())) {
              const dbSchemaFolders = await getDBSchemaFolders();
              // check if folder contains dbSchemaFolder
              const folderParts = relativeFileName.split("/");
              let scheme:string|undefined = undefined;
              folderParts.forEach((part) => {
                if (scheme === undefined) {
                  dbSchemaFolders.forEach((schema) => {
                    scheme = part.includes(schema.label)?schema.label:scheme;
                    CompileTaskStore.getInstance().selectedSchemas = [schema?.description!];
                  });
                }
              });
              // scheme, when schema include as file name, otherwise selected on
              let schemaSelected: boolean = scheme || await selectSchema(dbSchemaFolders);
              if (schemaSelected) {
                commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
              }
            } else {
              window.showWarningMessage('Current filetype or location is not supported by dbFlux ...');
            }
          }
        }).catch((e: any) => {
          console.error(e);
          window.showErrorMessage(`dbFlux: No executable ${ConfigurationManager.getCliToUseForCompilation()} found on path!`);
        });



      } else {
        window.showWarningMessage('incomplete credentials provided ... nothing to do ...');
      }
    }
  });
}

export async function selectSchema(dbSchemaFolders: QuickPickItem[]) {
  let schemaSelected: boolean = false;
  if (dbSchemaFolders.length > 1) {
    const item: QuickPickItem | undefined = await window.showQuickPick(dbSchemaFolders, {
      canPickMany: false, placeHolder: 'Choose Schema to execute this file'
    });
    schemaSelected = (item !== undefined);
    CompileTaskStore.getInstance().selectedSchemas = [item?.description!];
  } else if (dbSchemaFolders.length === 1) {
    schemaSelected = true;
    CompileTaskStore.getInstance().selectedSchemas = dbSchemaFolders?.map(function (element) { return element.description!; });
  }
  return schemaSelected;
}

async function isfileLockedByAnotherUser(projectName: string, relativeFileName: string):Promise<ILockedFile> {
  let element:ILockedFile = {isLocked:false, user:""};
  const urlEncodedFile = encodeURIComponent(relativeFileName!);
  const urlFromSettings = rtrim(ConfigurationManager.getDBLockRESTUrl(), "/");
  const url = `${urlFromSettings}/dblock/v1/file/${projectName.toLowerCase()}?filename=${urlEncodedFile}`;
  const options = {
    method: 'GET',
    headers: { Accept: '*/*',
              'User-Agent': 'VSCode (dbFlux)',
              'mandant': ConfigurationManager.getDBLockMandantToken()
            }
  };

  const response = await fetch(url, options);
  if (response.ok) {
    const data = await response.json();

    if (data.items.length > 0) {
      element.isLocked = true;
      element.user = data.items[0].lfs_user?data.items[0].lfs_user:"unknown";
      // console.log('element', element);
      outputLog(`File is locked by ${element.user}`);
    } else {
      outputLog(`File is not locked`);
    }
  } else {
    outputLog(`Response status from ${urlFromSettings} was ${response.status}`);
  }

  return element;
}


export function registerRunSQLcli(projectInfos: IProjectInfos, command: string, cli: string) {
  return commands.registerCommand(command, async () => {

    const dbSchemaFolders = await getDBSchemaFolders();
    let schemaSelected: boolean = await selectSchema(dbSchemaFolders);

    if (schemaSelected) {
      await setAppPassword(projectInfos)

      const compTaskStoreInstance = CompileTaskStore.getInstance();
      if (compTaskStoreInstance.appPwd !== undefined) {
        const userName = buildConnectionUser(projectInfos, "", undefined);
        const termName = cli;
        const term = window.createTerminal({name:termName,
          env: { "DBFLUX_TERM_PWD": compTaskStoreInstance.appPwd}});
          // term.show(true);

          window.onDidCloseTerminal(event => {
            if (term && termName === event.name) {
              term.dispose();
            }
          });

          term.sendText(cli + " " + userName + "/${DBFLUX_TERM_PWD}@" + projectInfos.dbTns);
          term.sendText("DBFLUX_TERM_PWD=");
          term.sendText("exit");
          term.show(true);
          commands.executeCommand("workbench.action.terminal.focus");

      }
    }
  });
}