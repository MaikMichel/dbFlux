/* eslint-disable @typescript-eslint/naming-convention */

import * as fs from "fs";
import * as path from "path";
import { ConfigurationManager, focusProblemPanel } from "../helper/ConfigurationManager";
import { getActiveFileUri, getStaticReference, getWorkingFile, getWorkspaceRootPath, matchRuleShort } from "../helper/utilities";
import { AbstractBashTaskProvider, getDBSchemaFolders, getProjectInfos, IBashInfos } from "./AbstractBashTaskProvider";
import { CompileTaskStore, setAdminPassword, setAdminUserName, setAppPassword } from "../stores/CompileTaskStore";
import { commands, ExtensionContext, QuickPickItem, ShellExecution, Task, TaskDefinition, TaskProvider, TaskScope, Uri, window, workspace } from "vscode";
import { Terserer } from "../templaters/Terserer";
import { Uglifyer } from "../templaters/Uglifyer";
import { SimpleUploader } from "../templaters/SimpleUploader";
import { ReportTemplater } from "../templaters/ReportTemplater";


const which = require('which');

interface OraTaskDefinition extends TaskDefinition {
  name:   string;
  runner: ICompileInfos;
}

interface ICompileInfos extends IBashInfos {
  activeFile:         string;
  relativeWSPath:     string;
  executableCli:      string;
  moveYesNo:          string;
  enableWarnings:     string;
  trgRunsConn:        string;
  trgRunsFile:        string;
  coloredOutput:      string;
  additionalOutput:   string;
}

export class CompileTaskProvider extends AbstractBashTaskProvider implements TaskProvider {


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

          DBFLOW_CONN_RUNS:         definition.runner.trgRunsConn,
          DBFLOW_FILE_RUNS:         definition.runner.trgRunsFile,

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
    let fileUri:Uri|undefined = await getActiveFileUri();

    if (fileUri !== undefined) {
      this.setInitialCompileInfo("deploy.sh", fileUri, runner);


      runner.activeFile         = fileUri.fsPath.split(path.sep).join(path.posix.sep);
      runner.relativeWSPath     = workspace.asRelativePath(runner.activeFile);
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


}


export function registerCompileSchemasCommand(context: ExtensionContext) {
  return commands.registerCommand("dbFlux.compileSchemas", async () => {
    const projectInfosReloaded = getProjectInfos(context);
    if (projectInfosReloaded.isValid) {
      setAppPassword(projectInfosReloaded);

      if (CompileTaskStore.getInstance().appPwd !== undefined) {

        let schemaSelected: boolean = false;
        const dbSchemaFolders = await getDBSchemaFolders();
        if (dbSchemaFolders.length > 1) {

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
          which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
            await commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileSchemas");
          }).catch(() => {
            window.showErrorMessage(`dbFlux: No executable ${ConfigurationManager.getCliToUseForCompilation()} found on path!`);
          });
        }
      }
    }
  });
}

export function registerCompileFileCommand(context: ExtensionContext) {
  return commands.registerCommand("dbFlux.compileFile", async () => {

    // save file
    let fileUri:Uri|undefined = window.activeTextEditor?.document.uri;
    if (fileUri !== undefined) {
      await window.activeTextEditor?.document.save();
    }

    // get current config
    const projectInfosReloaded = getProjectInfos(context);
    const compTaskStoreInstance = CompileTaskStore.getInstance();

    if (projectInfosReloaded.isValid) {

      // check what file has to build
      let fileName = await getWorkingFile();
      const relativeFileName = fileName.replace(getWorkspaceRootPath() + "/", "")
      console.log('relativeFileName', relativeFileName);

      const insideSetup = (matchRuleShort(relativeFileName, 'db/_setup/*') || matchRuleShort(relativeFileName, 'db/.setup/*'));
      const insideDb = !insideSetup && matchRuleShort(relativeFileName, 'db/*');
      const insideStatics = matchRuleShort(relativeFileName, projectInfosReloaded.isFlexMode ? 'static/*/*/f*/src/*' : 'static/f*/src/*');
      const insideReports = matchRuleShort(relativeFileName, 'reports/*');
      const insideAPEX = matchRuleShort(relativeFileName, 'apex/*');
      const insideREST = matchRuleShort(relativeFileName, 'rest/*');
      const fileExtension: string = "" + relativeFileName.split('.').pop();
      const extensionAllowed = ConfigurationManager.getKnownSQLFileExtensions();

      // Set password and userinfo to taskStore
      if (insideSetup) {
        await setAdminUserName(projectInfosReloaded);
        await setAdminPassword(projectInfosReloaded);
      } else {
        await setAppPassword(projectInfosReloaded);
      }

      if ((insideSetup
        && (compTaskStoreInstance.adminPwd !== undefined
          && compTaskStoreInstance.adminUser !== undefined))
        || (!insideSetup
          && (compTaskStoreInstance.appPwd !== undefined))) {

        which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {

          if (extensionAllowed.map(ext => ext.toLowerCase()).includes(fileExtension.toLowerCase()) && (insideSetup || insideDb || insideREST || insideAPEX)) {
             // call the compile Task itself
             commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");

             // when configured, the problem panel will be focused
             focusProblemPanel();

          } else if (insideStatics && ['js'].includes(fileExtension.toLowerCase())) {
            // Minify and create JS-Maps when needed
            const tersered = new Terserer(fileName, projectInfosReloaded.isFlexMode);
            const success = await tersered.genFile();
            if (success) {
              commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
            } else {
              window.showErrorMessage("dbFlux/terser: " + tersered.getLastErrorMessage());
            }
          } else if (insideStatics && ['css'].includes(fileExtension.toLowerCase())) {
            // Minify CSS
            const uglifyer = new Uglifyer(fileName, projectInfosReloaded.isFlexMode);
            uglifyer.genFile();
            commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
          } else if (insideStatics) {
            // Otherwise (not JS or CSS) simple upload the file
            const simpleUploader = new SimpleUploader(fileName, projectInfosReloaded.isFlexMode);
            simpleUploader.genFile();
            commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
          } else if (insideReports && !extensionAllowed.map(ext => ext.toLowerCase()).includes(fileExtension.toLowerCase())) {
            const reportTemplater = new ReportTemplater(fileName);
            reportTemplater.genFile();
          } else if (insideReports || !(insideDb || insideREST || insideAPEX || insideSetup || insideStatics) && extensionAllowed.map(ext => ext.toLowerCase()).includes(fileExtension.toLowerCase())) {
              const dbSchemaFolders = await getDBSchemaFolders();
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

              if (schemaSelected) {
                console.log('CompileTaskStore.getInstance().selectedSchemas', CompileTaskStore.getInstance().selectedSchemas);
                commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
              }
            // if (extensionAllowed.map(ext => ext.toLowerCase()).includes(fileExtension.toLowerCase())) {
            //   // Ask for schema and compile
            //   // now run
            // } else {
            //   if (insideReports) {
            //     // gen file
            //     const reportTemplater = new ReportTemplater(fileName);
            //     reportTemplater.genFile();
            //   }
            // }
          } else {
            console.log('insideReports', insideReports);
            console.log('extensionAllowed.map(ext => ext.toLowerCase()).includes(fileExtension.toLowerCase())', extensionAllowed.map(ext => ext.toLowerCase()).includes(fileExtension.toLowerCase()));
            window.showWarningMessage('Current filetype or location is not supported by dbFlux ...');
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