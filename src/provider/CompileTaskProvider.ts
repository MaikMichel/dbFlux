/* eslint-disable @typescript-eslint/naming-convention */

import * as fs from "fs";
import * as path from "path";
import { ConfigurationManager, focusProblemPanel } from "../helper/ConfigurationManager";
import { getActiveFileUri, getStaticReference, getWorkingFile, groupByKey, matchRuleShort } from "../helper/utilities";
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
  dataConn:           string;
  dataFile:           string;
  logicConn:          string;
  logicFile:          string;
  appConn:            string;
  appFile:            string;
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
    // get currenct config
    const projectInfosReloaded = getProjectInfos(context);
    const compTaskStoreInstance = CompileTaskStore.getInstance();

    if (projectInfosReloaded.isValid) {

      // check what file has to build
      let fileName = await getWorkingFile();

      const insideSetup = matchRuleShort(fileName, '*/db/_setup/*');

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

        const insideStatics = matchRuleShort(fileName, projectInfosReloaded.isFlexMode ? '*/static/*/*/f*/src/*' : '*/static/f*/src/*');
        const insideReports = matchRuleShort(fileName, '*/reports/*');
        const fileExtension: string = "" + fileName.split('.').pop();
        const extensionAllowed = ConfigurationManager.getKnownSQLFileExtensions();

        which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
          if (extensionAllowed.map(ext => ext.toLowerCase()).includes(fileExtension.toLowerCase())) {

            // call the compile Task itself
            commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");

            // when configured, the problem panel will be focused
            focusProblemPanel();

          } else if (insideStatics && ['js'].includes(fileExtension.toLowerCase())) {
            const tersered = new Terserer(fileName, projectInfosReloaded.isFlexMode);
            const success = await tersered.genFile();
            if (success) {
              commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
            } else {
              window.showErrorMessage("dbFlux/terser: " + tersered.getLastErrorMessage());
            }

          } else if (insideStatics && ['css'].includes(fileExtension.toLowerCase())) {
            const uglifyer = new Uglifyer(fileName, projectInfosReloaded.isFlexMode);
            uglifyer.genFile();
            commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
          } else if (insideStatics) {
            const simpleUploader = new SimpleUploader(fileName, projectInfosReloaded.isFlexMode);
            simpleUploader.genFile();
            commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
          } else if (insideReports) {
            const reportTemplater = new ReportTemplater(fileName);
            reportTemplater.genFile();
            // commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
          } else {
            window.showWarningMessage('Current filetype is not supported by dbFlux ...');
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