/* eslint-disable @typescript-eslint/naming-convention */

import * as fs from "fs";
import * as path from "path";
import { ConfigurationManager, focusProblemPanel } from "../helper/ConfigurationManager";
import { getActiveFileUri, getApplicationIdFromApexPath, getPassword, getStaticReference, getWorkingFile, getWorkspaceRootPath, matchRuleShort, rtrim } from "../helper/utilities";
import { AbstractBashTaskProvider, buildConnectionUser, getDBSchemaFolders, IBashInfos, IProjectInfos } from "./AbstractBashTaskProvider";
import { CompileTaskStore, setAdminPassword, setAdminUserName, setAppPassword } from "../stores/CompileTaskStore";
import { commands, ExtensionContext, QuickPickItem, ShellExecution, Task, TaskDefinition, TaskProvider, tasks, TaskScope, Uri, window, workspace } from "vscode";
import { Terserer } from "../templaters/Terserer";
import { Uglifyer } from "../templaters/Uglifyer";
import { SimpleUploader } from "../templaters/SimpleUploader";
import { ReportTemplater } from "../templaters/ReportTemplater";
import fetch from "node-fetch";

import { CompileSchemasProvider } from "./CompileSchemasProvider";
import { homedir } from "os";
import { LoggingService } from "../helper/LoggingService";


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
  onlyTriggerRun:     string;
  useSQLErrorLog:     string;
}


export class CompileTaskProvider extends AbstractBashTaskProvider implements TaskProvider {
  onlyTrigger: boolean = false;

  constructor(context: ExtensionContext, onlyTrigger: boolean = false) {
    super(context);
    this.onlyTrigger = onlyTrigger;
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

          DBFLOW_TRIGGER_ONLY:      this.onlyTrigger?"YES":"NO",
          DBFLOW_CONN_RUNS:         definition.runner.trgRunsConn,
          DBFLOW_FILE_RUNS:         definition.runner.trgRunsFile,

          DBFLOW_CONN_CALLS:        definition.runner.trgCallsConn,
          DBFLOW_METHOD_CALLS:      definition.runner.trgCallsMethod,
          DBFLOW_METHOD_TFILES:     definition.runner.trgCallsTFile,

          DBFLOW_COLOR_ON:          definition.runner.coloredOutput,
          DBFLOW_USE_SLOG:          definition.runner.useSQLErrorLog,

          DBFLOW_TARGET_APP_ID:    CompileTaskStore.getInstance().targetApplicationID + "",
          DBFLOW_TARGET_WORKSP:    CompileTaskStore.getInstance().targetWorkspace + ""
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
    let fileUri:Uri|undefined = await getActiveFileUri(this.context);

    if (fileUri !== undefined) {
      await this.setInitialCompileInfo("deploy.sh", fileUri, runner);


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
      const insideStatics = matchRuleShort(runner.relativeWSPath, runner.projectInfos.isFlexMode ? 'static/*/*/f*/src/*' : 'static/f*/src/*');
      const insidePlugins = matchRuleShort(runner.relativeWSPath, runner.projectInfos.isFlexMode ? 'plugin/*/*/f*/*' : 'plugin/f*/*');
      if ((insideStatics || insidePlugins) && fs.existsSync(runner.activeFile + ".sql")) {
        runner.activeFile += ".sql";
        runner.moveYesNo = "YES";
        runner.additionalOutput = "Reference file by using: " + getStaticReference(runner.relativeWSPath+".sql", runner.projectInfos.isFlexMode);
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
          "connection": this.getConnection(compInfos.projectInfos, runner.runFile, true),
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
          "connection": this.getConnection(compInfos.projectInfos, runner.runMethodTargetFile, true),
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

          // preselect folders/schemas based on last choice
          const selectedFolders  = (context.workspaceState.get("dbFlux_last_compiled_folders")!+"").split("|");
          dbSchemaFolders.forEach((v)=>{
            v.picked = selectedFolders.includes(v.description!);
          });

          const items: QuickPickItem[] | undefined = await window.showQuickPick(dbSchemaFolders, {
            canPickMany: true, placeHolder: 'Choose Schema to compile'
          });

          schemaSelected = (items !== undefined && items?.length > 0);
          CompileTaskStore.getInstance().selectedSchemas = items?.map(function (element) { return element.description!; });

          // store choice for next use
          context.workspaceState.update("dbFlux_last_compiled_folders", CompileTaskStore.getInstance().selectedSchemas?.join("|"));
        } else if (dbSchemaFolders.length === 1) {
          schemaSelected = true;
          CompileTaskStore.getInstance().selectedSchemas = dbSchemaFolders?.map(function (element) { return element.description!; });
        }

        if (schemaSelected) {
          const options = [{label:"Invalid", description: "Only invalid object will be compiled"},{label:"All", description: "All objects will be compiled"}];
          const compileOption: QuickPickItem | undefined = await window.showQuickPick(options, {
            canPickMany: false, placeHolder: 'Compile all or just the invalide ones'
          });


          if (compileOption !== undefined) {

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

export function registerCompileFileCommand(projectInfos: IProjectInfos, context: ExtensionContext, commandKey: string = 'dbFlux.compileFile') {


  return commands.registerCommand(commandKey, async () => {
    LoggingService.logDebug(`Enter commandKey`);

    let fileUri:Uri|undefined = window.activeTextEditor?.document.uri;
    if (fileUri !== undefined) {
      LoggingService.logInfo(`saving file`);
      await window.activeTextEditor?.document.save();
    }

    LoggingService.logDebug(`Reading Configuration`);
    const compTaskStoreInstance = CompileTaskStore.getInstance();
    const dbLockService = ConfigurationManager.isDBLockEnabled();

    if (projectInfos.isValid) {
      LoggingService.logDebug(`Configuration is valid.`);
      // check what file has to build
      let fileName = await getWorkingFile(context);
      const relativeFileName = fileName.replace(getWorkspaceRootPath() + "/", "");

      LoggingService.logDebug(`File to compile is: ${relativeFileName}`);

      const insideSetup = (matchRuleShort(relativeFileName, `${ConfigurationManager.getDBFolderName()}/_setup/*`) || matchRuleShort(relativeFileName, `${ConfigurationManager.getDBFolderName()}/.setup/*`));
      const insideDb = !insideSetup && matchRuleShort(relativeFileName, `${ConfigurationManager.getDBFolderName()}/*`);
      const insideStatics = matchRuleShort(relativeFileName, projectInfos.isFlexMode ? 'static/*/*/f*/src/*' : 'static/f*/src/*');
      const insidePlugins = matchRuleShort(relativeFileName, projectInfos.isFlexMode ? 'plugin/*/*/f*/*/src/*' : 'plugin/f*/*/src/*');
      const insideReports = matchRuleShort(relativeFileName, 'reports/*');
      const insideAPEX = matchRuleShort(relativeFileName, 'apex/*');
      const insideREST = matchRuleShort(relativeFileName, 'rest/*');
      const fileExtension: string = "" + relativeFileName.split('.').pop();
      const extensionAllowed = ConfigurationManager.getKnownSQLFileExtensions();

      // Set password and userinfo to taskStore
      if (insideSetup) {
        LoggingService.logDebug(`inside setup, check admin pass`);
        await setAdminUserName(projectInfos);
        await setAdminPassword(projectInfos);
      } else {
        LoggingService.logDebug(`outside setup, check application pass`);
        await setAppPassword(projectInfos, context, relativeFileName);
      }

      if ((insideSetup
        && (compTaskStoreInstance.adminPwd !== undefined
          && compTaskStoreInstance.adminUser !== undefined))
        || (!insideSetup
          && (compTaskStoreInstance.appPwd !== undefined))) {

        which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {


          let compilable = true;
          if (dbLockService) {
            LoggingService.logDebug(`dbLockService is activated, validating locked state`);
            try {
              const locked:ILockedFile = await isfileLockedByAnotherUser(projectInfos.projectName!, relativeFileName);
              const currentUser = process.env.username?process.env.username:path.basename(homedir());

              if (locked.isLocked && locked.user !== currentUser) {
                LoggingService.logInfo(`File is locked by User ${locked.user}. You have to unlock the file first!`);

                compilable = false;
                await window.showWarningMessage(`File is locked by User ${locked.user}. You have to unlock the file first!`);
              }
            } catch (e:any) {
              LoggingService.logError(`Error occured`, e);
              await window.showErrorMessage(`dbFlux (dbLock): ${e}!`);
            }
          }

          if (compilable) {
            LoggingService.logDebug(`File is not locked, try to check if we can compile`);

            context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new CompileTaskProvider(context, commandKey !== 'dbFlux.compileFile')));


            LoggingService.logDebug(`Evaluate`, {
                "extensionAllowed": extensionAllowed.map(ext => ext.toLowerCase()).includes(fileExtension.toLowerCase()),
                "insideSetup"     : insideSetup,
                "insideDb"        : insideDb,
                "insideREST"      : insideREST,
                "insideAPEX"      : insideAPEX
              }
            );

            // Reset target props
            CompileTaskStore.getInstance().targetApplicationID = undefined;
            CompileTaskStore.getInstance().targetWorkspace = undefined;

            if (extensionAllowed.map(ext => ext.toLowerCase()).includes(fileExtension.toLowerCase()) && (insideSetup || insideDb || insideREST || insideAPEX)) {
              if (insideAPEX && path.basename(relativeFileName) === "install.sql") {
                LoggingService.logDebug(`We are inside apex and running an install.sql file`);

                CompileTaskStore.getInstance().targetApplicationID = await askForTargetAppID(relativeFileName, projectInfos.isFlexMode);
                if (CompileTaskStore.getInstance().targetApplicationID === undefined) {
                  return;
                }
                CompileTaskStore.getInstance().targetWorkspace = await getTargetWorkspaceName(relativeFileName, projectInfos);
                if (CompileTaskStore.getInstance().targetWorkspace === undefined) {
                  await window.showWarningMessage(`Unknown Workspace! Missing item in project configuration?`);
                  return;
                }
              }


              LoggingService.logDebug(`call the compile Task itself: "dbFlux: compileFile"`);
              commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");

              // when configured, the problem panel will be focused
              focusProblemPanel();

            } else if (insideStatics && ['js'].includes(fileExtension.toLowerCase())) {
              LoggingService.logDebug(`We are inside statics an there inside "js", so just call Terserer to minify JavaScript`);

              // Minify and create JS-Maps when needed
              const tersered = new Terserer(fileName, projectInfos.isFlexMode);
              const success = await tersered.genFile();
              if (success) {
                LoggingService.logDebug(`call the compile Task itself: "dbFlux: compileFile" to run generated files`);
                commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
              } else {
                LoggingService.logError("dbFlux/terser: " + tersered.getLastErrorMessage());
                window.showErrorMessage("dbFlux/terser: " + tersered.getLastErrorMessage());
              }
            } else if (insideStatics && ['css'].includes(fileExtension.toLowerCase())) {
              LoggingService.logDebug(`We are inside statics an there inside "css", so just call Uglifyer to minify JavaScript`);

              // Minify CSS
              const uglifyer = new Uglifyer(fileName, projectInfos.isFlexMode);
              uglifyer.genFile();

              LoggingService.logDebug(`call the compile Task itself: "dbFlux: compileFile" to run generated files`);
              commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
            } else if (insideStatics) {
              LoggingService.logDebug(`We are inside statics an there not in inside "css,js"`);

              // Otherwise (not JS or CSS) simple upload the file
              const simpleUploader = new SimpleUploader(projectInfos.isFlexMode);
              simpleUploader.genFile(fileName);

              LoggingService.logDebug(`call the compile Task itself: "dbFlux: compileFile" to run generated files`);
              commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
            } else if (insidePlugins && ['js'].includes(fileExtension.toLowerCase())) {
              LoggingService.logDebug(`We are plugins plugin an there inside "js", so just call Terserer to minify JavaScript`);

              // Minify and create JS-Maps when needed
              const tersered = new Terserer(fileName, projectInfos.isFlexMode);
              const success = await tersered.genFile(true);
              if (success) {
                LoggingService.logDebug(`call the compile Task itself: "dbFlux: compileFile" to run generated files`);
                commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
              } else {
                LoggingService.logError("dbFlux/terser: " + tersered.getLastErrorMessage());
                window.showErrorMessage("dbFlux/terser: " + tersered.getLastErrorMessage());
              }
            } else if (insidePlugins && ['css'].includes(fileExtension.toLowerCase())) {
              LoggingService.logDebug(`We are plugins plugin an there inside "css", so just call Uglifyer to minify JavaScript`);

              // Minify CSS
              const uglifyer = new Uglifyer(fileName, projectInfos.isFlexMode);
              uglifyer.genFile(true);

              LoggingService.logDebug(`call the compile Task itself: "dbFlux: compileFile" to run generated files`);
              commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
            } else if (insidePlugins) {
              LoggingService.logDebug(`We are inside plugins an there not in inside "css,js"`);

              // Otherwise (not JS or CSS) simple upload the file
              const simpleUploader = new SimpleUploader(projectInfos.isFlexMode);
              simpleUploader.genFile(fileName, true);

              LoggingService.logDebug(`call the compile Task itself: "dbFlux: compileFile" to run generated files`);
              commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
            } else if (insideReports && !extensionAllowed.map(ext => ext.toLowerCase()).includes(fileExtension.toLowerCase())) {
              LoggingService.logDebug(`We are inside reports, let's try to search for a template`);

              const reportTemplater = new ReportTemplater(fileName);
              reportTemplater.genFile();
            } else if (insideReports || !(insideDb || insideREST || insideAPEX || insideSetup || insideStatics) && extensionAllowed.map(ext => ext.toLowerCase()).includes(fileExtension.toLowerCase())) {
              LoggingService.logDebug(`We are inside reports or elsewhere but not inside DB, REST, APEX, Static. Let's try to run that file anyway`);

              const dbSchemaFolders = await getDBSchemaFolders();
              LoggingService.logDebug(`Schemafolder: `, dbSchemaFolders);

              // check if folder contains dbSchemaFolder
              const folderParts = relativeFileName.split("/");
              let scheme:string|undefined = undefined;
              for (let part of folderParts) {
                if (scheme === undefined) {

                  for(let schema of dbSchemaFolders) {
                    scheme = part.includes(schema.label)?schema.label:scheme;
                    CompileTaskStore.getInstance().selectedSchemas = [schema?.description!];
                  };

                }
              };

              // scheme, when schema include as file name, otherwise selected on
              let schemaSelected: boolean = (scheme !== undefined) || await selectSchema(dbSchemaFolders);
              if (schemaSelected) {
                LoggingService.logDebug(`call the compile Task itself: "dbFlux: compileFile" to run selected file`);
                commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
              }
            } else {
              LoggingService.logWarning(`Current filetype or location is not supported by dbFlux ...`);
              window.showWarningMessage('Current filetype or location is not supported by dbFlux ...');
            }
          }
        }).catch((e: any) => {
          console.error(e);
          LoggingService.logError(`dbFlux: No executable ${ConfigurationManager.getCliToUseForCompilation()} found on path!`, e);
          window.showErrorMessage(`dbFlux: No executable ${ConfigurationManager.getCliToUseForCompilation()} found on path!`);
        });



      } else {
        LoggingService.logError(`incomplete credentials provided ... nothing to do ...`);
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

      LoggingService.logError(`File is locked by ${element.user}`);
    } else {
      LoggingService.logError(`File is not locked`);
    }
  } else {
    LoggingService.logError(`Response status from ${urlFromSettings} was ${response.status}`);
  }

  return element;
}


export function registerRunSQLcli(projectInfos: IProjectInfos, command: string, cli: string, context: ExtensionContext) {
  return commands.registerCommand(command, async () => {

    const dbSchemaFolders = await getDBSchemaFolders();
    let schemaSelected: boolean = await selectSchema(dbSchemaFolders);
    const selectedSchemas = CompileTaskStore.getInstance().selectedSchemas;

    if (schemaSelected && selectedSchemas) {
      const connectionUser = buildConnectionUser(projectInfos, "", undefined);
      const schemaName = selectedSchemas[0].split("/")[1];
      await setAppPassword(projectInfos);
      const passWord = getPassword(projectInfos, schemaName, (CompileTaskStore.getInstance().appPwd === undefined) , context);

      if (passWord !== undefined) {
        const termName = cli;

        const term = window.createTerminal(termName, 'bash', ['-cl', cli + " " + connectionUser + "/" + passWord + "@" + projectInfos.dbTns]);

          window.onDidCloseTerminal(event => {
            if (term && termName === event.name) {
              term.dispose();
            }
          });

          term.show(true);

          commands.executeCommand("workbench.action.terminal.focus");

      }
    }
  });
}

async function askForTargetAppID(file:string, isFlexMode:boolean): Promise<number|undefined> {
  const sourceAppID = getApplicationIdFromApexPath(path.dirname(file), isFlexMode);
  const value:string | undefined = await window.showInputBox({ prompt: "Target APP ID", placeHolder: "Enter target APP ID", value: sourceAppID });
  return value ? Number.parseInt(value).valueOf() : undefined;
}

async function getTargetWorkspaceName(file:string, projectInfos:IProjectInfos): Promise<string|undefined> {
  // when FlexMode from file
  if (projectInfos.isFlexMode){
    // */[static|apex]/scheman_name/workspace_name/f_with_app_id/src/*
    const wsRoot = getWorkspaceRootPath();
    const parts = file.replace(wsRoot+"/", "").split("/");
    return parts[2];
  } else {
    return projectInfos.workspace;
  }
}
