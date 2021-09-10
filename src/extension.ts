import * as vscode from "vscode";

import * as path from "path";
import { CompileTaskProvider } from "./CompileTaskProvider";

import { Terserer } from "./Terserer";
import { matchRuleShort } from "./utilities";
import { Uglifyer } from "./Uglifyer";
import { ExportTaskProvider } from "./ExportTaskProvider";
import { ExportTaskStore } from "./ExportTaskStore";
import { RestTaskStore } from "./RestTaskStore";
import { RestTaskProvider } from "./RestTaskProvider";
import { SimpleUploader } from "./SimpleUploader";
import { getDBFlowMode, getProjectInfos } from "./AbstractBashTaskProvider";
import { TestTaskProvider } from "./TestTaskProvider";
import { ReportTemplater } from "./ReportTemplater";
import { CompileTaskStore } from "./CompileTaskStore";
import { TestTaskStore } from "./TestTaskStore";
import { ConfigurationManager } from "./ConfigurationManager";
import { outputLog } from './OutputChannel';
import { existsSync } from "fs";
import { multiStepInput } from './multiStepInput';

var which = require('which');






let myStatusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {

  const mode = getDBFlowMode(context);
  console.log('mode:', mode);

  context.subscriptions.push(vscode.commands.registerCommand("dbFlux.reloadExtension", (_) => {
    deactivate();
    for (const sub of context.subscriptions) {
      try {
        sub.dispose();
      } catch (e) {
        console.error(e);
      }
    }
    activate(context);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('dbFlux.wizard', async () => {
    multiStepInput(context);
  }));

  // mode is defines and dbFlux or mode is dbFlow, xcl and dbConf exists
  // TODO dbConf for dbFlux has to be checked too
  if (mode !== undefined && ( (mode === "dbFlux") || (["dbFlow", "xcl"].includes(mode) && applyFileExists(mode)))) {
    let projectInfos = getProjectInfos(context);
    let tooltip = "";

    outputLog(`dbFlux-Mode is ${mode}`);
    vscode.commands.executeCommand("setContext", "inDbFlowProject", true);

    if (["dbFlow", "xcl"].includes(mode) && vscode.workspace.workspaceFolders) {

      let applyFileName = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, mode === "dbFlow"?"apply.env":".xcl/env.yml");
      let buildFileName = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, mode === "dbFlow"?"build.env":"xcl.yml");

      tooltip = `dbFlux: configuration found (${path.basename(buildFileName)}/${path.basename(applyFileName)})`;
      // Command to open build and applyFiles
      context.subscriptions.push(vscode.commands.registerCommand('dbFlux.showConfig', () => {

          vscode.workspace.openTextDocument(vscode.Uri.file(applyFileName)).then(doc => {
            vscode.window.showTextDocument(doc, {preview: false});
          });


          vscode.workspace.openTextDocument(vscode.Uri.file(buildFileName)).then(doc => {
            vscode.window.showTextDocument(doc, {preview: false, viewColumn: vscode.ViewColumn.Beside});
          });

      }));

    } else {
      tooltip = `dbFlux: configuration found in workspaceState`;

      // Command to view Config
      context.subscriptions.push(vscode.commands.registerCommand('dbFlux.showConfig', () => {

        outputLog("Outputting Configuration", true);

        outputLog("DB_TNS: " + context.workspaceState.get("dbFlux_DB_TNS"));
        outputLog("DB_APP_USER: " + context.workspaceState.get("dbFlux_DB_APP_USER"));
        outputLog("DB_APP_PWD: " + context.workspaceState.get("dbFlux_DB_APP_PWD"));
        outputLog("DB_ADMIN_USER: " + context.workspaceState.get("dbFlux_DB_ADMIN_USER"));

        outputLog("PROJECT: " + context.workspaceState.get("dbFlux_PROJECT"));
        outputLog("WORKSPACE: " + context.workspaceState.get("dbFlux_WORKSPACE"));
        outputLog("DATA_SCHEMA: " + context.workspaceState.get("dbFlux_DATA_SCHEMA"));
        outputLog("LOGIC_SCHEMA: " + context.workspaceState.get("dbFlux_LOGIC_SCHEMA"));
        outputLog("APP_SCHEMA: " + context.workspaceState.get("dbFlux_APP_SCHEMA"));
      }));

    }


    // statusbaritem to indicate we can use dbFlux
    myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    myStatusBarItem.command = 'dbFlux.showConfig';
    myStatusBarItem.text = `$(database) ${mode}`;
    myStatusBarItem.tooltip = tooltip;
    myStatusBarItem.show();
    context.subscriptions.push(myStatusBarItem);




    // Compile
    let sqlPlusCommand = vscode.commands.registerCommand("dbFlux.compileFile", async () => {
      projectInfos = getProjectInfos(context);

      if (projectInfos.isValid) {

        // check what file has to build
        const tmpClipboard = await vscode.env.clipboard.readText();
        let fileName = vscode.window.activeTextEditor?.document.fileName.split(path.sep).join(path.posix.sep)!;

        if (fileName === undefined) {
          await vscode.commands.executeCommand('copyFilePath');
          fileName = await vscode.env.clipboard.readText();
          fileName = fileName.split('\n')[0].split(path.sep).join(path.posix.sep)!;

          await vscode.env.clipboard.writeText(tmpClipboard);
        }

        const insideSys = matchRuleShort(fileName, '*/db/_sys/*');
        console.log('insideSys:', insideSys);

        // now check connection infos
        if (insideSys) {
          if (!projectInfos.dbAdminUser) {
            if (!CompileTaskStore.getInstance().adminUser) {
              CompileTaskStore.getInstance().adminUser  = await vscode.window.showInputBox({ prompt: `dbFlux: Enter Admin user name for connection: ${projectInfos.dbTns}` , placeHolder: "admin"});
            } else {
              if (CompileTaskStore.getInstance().adminUser?.length === 0) {
                CompileTaskStore.getInstance().adminUser = undefined;
              }
            }
          } else {
            CompileTaskStore.getInstance().adminUser = projectInfos.dbAdminUser;
          }

          if (!projectInfos.dbAdminPwd) {
            if (!CompileTaskStore.getInstance().adminPwd) {
              CompileTaskStore.getInstance().adminPwd  = await vscode.window.showInputBox({ prompt: `dbFlux: Enter Password for connection ${projectInfos.dbAdminUser}@${projectInfos.dbTns}` , placeHolder: "Password", password: true});
            } else {
              if (CompileTaskStore.getInstance().adminPwd?.length === 0) {
                CompileTaskStore.getInstance().adminPwd = undefined;
              }
            }
          } else {
            CompileTaskStore.getInstance().adminPwd = projectInfos.dbAdminPwd;
          }


        } else {
          if (!projectInfos.dbAppPwd) {
            if (!CompileTaskStore.getInstance().appPwd) {
              CompileTaskStore.getInstance().appPwd  = await vscode.window.showInputBox({ prompt: `dbFlux: Enter Password for connection ${projectInfos.dbAppUser}@${projectInfos.dbTns}` , placeHolder: "Password", password: true});
            } else {
              if (CompileTaskStore.getInstance().appPwd?.length === 0) {
                CompileTaskStore.getInstance().appPwd = undefined;
              }
            }
          } else {
            CompileTaskStore.getInstance().appPwd = projectInfos.dbAppPwd;
          }
        }

        if (   (    insideSys
            && (    CompileTaskStore.getInstance().adminPwd  !== undefined
                 && CompileTaskStore.getInstance().adminUser !== undefined))
            ||  (    !insideSys
             && (    CompileTaskStore.getInstance().appPwd  !== undefined ))
                 ) {

          const insideStatics = matchRuleShort(fileName, '*/static/f*/src/*');
          const insideReports = matchRuleShort(fileName, '*/reports/*');
          const fileExtension:string = ""+fileName.split('.').pop();
          const extensionAllowed = ConfigurationManager.getKnownSQLFileExtensions();

          which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
            if (extensionAllowed.map(ext => ext.toLowerCase()).includes(fileExtension.toLowerCase()) ) {
              vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
            } else if (insideStatics && ['js'].includes(fileExtension.toLowerCase())) {
              const tersered = new Terserer(fileName);
              const success = await tersered.genFile();
              if ( success) {
                vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
              } else {
                vscode.window.showErrorMessage("dbFlux/terser: "+ tersered.getLastErrorMessage());
              }

            } else if (insideStatics && ['css'].includes(fileExtension.toLowerCase())) {
              const uglifyer = new Uglifyer(fileName);
              uglifyer.genFile();
              vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
            } else if (insideStatics) {
              const simpleUploader = new SimpleUploader(fileName);
              simpleUploader.genFile();
              vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
            } else if (insideReports) {
              const reportTemplater = new ReportTemplater(fileName);
              reportTemplater.genFile();
              // vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: compileFile");
            } else {
              vscode.window.showWarningMessage('Current filetype is not supported by dbFlux ...');
            }
          }).catch(() => {
            vscode.window.showErrorMessage(`dbFlux: No executable ${ConfigurationManager.getCliToUseForCompilation()} found on path!`);
          });

        } else {
          vscode.window.showWarningMessage('incomplete credentials provided ... nothing to do ...');
        }
      }
    });

    context.subscriptions.push(sqlPlusCommand);

    const oraTaskProvider: CompileTaskProvider = new CompileTaskProvider(context);
    const oraTaskProviderDisposable = vscode.tasks.registerTaskProvider("dbFlux", oraTaskProvider);
    context.subscriptions.push(oraTaskProviderDisposable);



    // Export APEX
    const exportCommand = vscode.commands.registerCommand("dbFlux.exportAPEX", async () => {
      projectInfos = getProjectInfos(context);
      if (projectInfos.isValid) {

        if ((projectInfos.dbAppPwd === undefined && CompileTaskStore.getInstance().appPwd === undefined) || (CompileTaskStore.getInstance().appPwd !== undefined && (""+CompileTaskStore.getInstance().appPwd).length === 0)) {
          CompileTaskStore.getInstance().appPwd  = await vscode.window.showInputBox({ prompt: `dbFlux: Enter Password for connection ${projectInfos.dbAppUser}@${projectInfos.dbTns}` , placeHolder: "Password", password: true});
          if (CompileTaskStore.getInstance().appPwd?.length === 0) {
            CompileTaskStore.getInstance().appPwd = undefined;
          }
        }


        if ((projectInfos.dbAppPwd  !== undefined && projectInfos.dbAppPwd?.length > 0) ||
            (CompileTaskStore.getInstance().appPwd !== undefined && (""+CompileTaskStore.getInstance().appPwd).length > 0)) {
          ExportTaskStore.getInstance().expID = await ExportTaskStore.getInstance().getAppID();

          which('sql').then(async () => {
            await vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: exportAPEX");
          }).catch(() => {
            vscode.window.showErrorMessage('dbFlux: No executable "sql" found on path!');
          });


        }
      }
    });


    context.subscriptions.push(exportCommand);


    const expTaskProvider: ExportTaskProvider = new ExportTaskProvider(context);
    const expTaskProviderDisposable = vscode.tasks.registerTaskProvider("dbFlux", expTaskProvider);
    context.subscriptions.push(expTaskProviderDisposable);

    // Add APEX App
    const addApplicationCommand = vscode.commands.registerCommand("dbFlux.addAPP", async () => {
      ExportTaskStore.getInstance().addApplication(await ExportTaskStore.getInstance().getNewApplication());

    });
    context.subscriptions.push(addApplicationCommand);

    // Add static app folder
    const addStaticAppFolder = vscode.commands.registerCommand("dbFlux.addStaticFolder", async () => {
      ExportTaskStore.getInstance().addStaticFolder(await ExportTaskStore.getInstance().getNewApplication());

    });
    context.subscriptions.push(addStaticAppFolder);

    // Add report type folder
    const addReportTypeFolder = vscode.commands.registerCommand("dbFlux.addReportFolder", async () => {
      ExportTaskStore.getInstance().addReportTypeFolder(await ExportTaskStore.getInstance().getReportType());

    });
    context.subscriptions.push(addReportTypeFolder);

    // Export REST
    const restCommand = vscode.commands.registerCommand("dbFlux.exportREST", async () => {
      projectInfos = getProjectInfos(context);
      if (projectInfos.isValid) {

        if ((projectInfos.dbAppPwd === undefined && CompileTaskStore.getInstance().appPwd === undefined) || (CompileTaskStore.getInstance().appPwd !== undefined && (""+CompileTaskStore.getInstance().appPwd).length === 0)) {
          CompileTaskStore.getInstance().appPwd  = await vscode.window.showInputBox({ prompt: `dbFlux: Enter Password for connection ${projectInfos.dbAppUser}@${projectInfos.dbTns}` , placeHolder: "Password", password: true});
          if (CompileTaskStore.getInstance().appPwd?.length === 0) {
            CompileTaskStore.getInstance().appPwd = undefined;
          }
        }


        if ((projectInfos.dbAppPwd  !== undefined && projectInfos.dbAppPwd?.length > 0) ||
            (CompileTaskStore.getInstance().appPwd !== undefined && (""+CompileTaskStore.getInstance().appPwd).length > 0)) {

          which('sql').then(async () => {
            RestTaskStore.getInstance().restModule = await RestTaskStore.getInstance().getRestModule();

            await vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: exportREST");
          }).catch(() => {
            vscode.window.showErrorMessage('dbFlux: No executable "sql" found on path!');
          });
        }
      }
    });
    context.subscriptions.push(restCommand);

    const restTaskProvider: RestTaskProvider = new RestTaskProvider(context);
    const restTaskProviderDisposable = vscode.tasks.registerTaskProvider("dbFlux", restTaskProvider);
    context.subscriptions.push(restTaskProviderDisposable);


    // Add REST Modul
    const addRestModulCommand = vscode.commands.registerCommand("dbFlux.addREST", async () => {
      RestTaskStore.getInstance().addRestModul(await RestTaskStore.getInstance().getNewRestModule());

    });
    context.subscriptions.push(addRestModulCommand);



    // run tests
    const testCommand = vscode.commands.registerCommand("dbFlux.executeTests", async () => {
      projectInfos = getProjectInfos(context);
      if (projectInfos.isValid) {
        if ((projectInfos.dbAppPwd === undefined && CompileTaskStore.getInstance().appPwd === undefined) || (CompileTaskStore.getInstance().appPwd !== undefined && (""+CompileTaskStore.getInstance().appPwd).length === 0)) {
          CompileTaskStore.getInstance().appPwd  = await vscode.window.showInputBox({ prompt: `dbFlux: Enter Password for connection ${projectInfos.dbAppUser}@${projectInfos.dbTns}` , placeHolder: "Password", password: true});
          if (CompileTaskStore.getInstance().appPwd?.length === 0) {
            CompileTaskStore.getInstance().appPwd = undefined;
          }
        }


        if ((projectInfos.dbAppPwd  !== undefined && projectInfos.dbAppPwd?.length > 0) ||
            (CompileTaskStore.getInstance().appPwd !== undefined && (""+CompileTaskStore.getInstance().appPwd).length > 0)) {

              if (projectInfos.useProxy) {
                TestTaskStore.getInstance().selectedSchemas = await vscode.window.showQuickPick([projectInfos.dataSchema, projectInfos.logicSchema, projectInfos.appSchema], {
                  canPickMany: true, placeHolder: 'Choose Schema to run your tests'
                });
              }

              which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
                await vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: executeTests");
              }).catch(() => {
                vscode.window.showErrorMessage(`dbFlux: No executable ${ConfigurationManager.getCliToUseForCompilation()} found on path!`);
              });
        }
      }
    });
    context.subscriptions.push(testCommand);

    const testTaskProvider: TestTaskProvider = new TestTaskProvider(context, "executeTests");
    const testTaskProviderDisposable = vscode.tasks.registerTaskProvider("dbFlux", testTaskProvider);
    context.subscriptions.push(testTaskProviderDisposable);



    // run test against package
    const testPackageTaskProvider: TestTaskProvider = new TestTaskProvider(context, "executeTestPackage");
    const testPackageTaskCommand = vscode.commands.registerCommand("dbFlux.executeTestPackage", async () => {
      projectInfos = getProjectInfos(context);
      if (projectInfos.isValid) {

        // check what file has to build
        const tmpClipboard = await vscode.env.clipboard.readText();
        let fileName = vscode.window.activeTextEditor?.document.fileName.split(path.sep).join(path.posix.sep)!;

        if (fileName === undefined) {
          await vscode.commands.executeCommand('copyFilePath');
          fileName = await vscode.env.clipboard.readText();
          fileName = fileName.split('\n')[0].split(path.sep).join(path.posix.sep)!;

          await vscode.env.clipboard.writeText(tmpClipboard);
        }



        // now check connection infos
        if ((projectInfos.dbAppPwd === undefined && CompileTaskStore.getInstance().appPwd === undefined) || (CompileTaskStore.getInstance().appPwd !== undefined && (""+CompileTaskStore.getInstance().appPwd).length === 0)) {
          CompileTaskStore.getInstance().appPwd  = await vscode.window.showInputBox({ prompt: `dbFlux: Enter Password for connection ${projectInfos.dbAppUser}@${projectInfos.dbTns}` , placeHolder: "Password", password: true});
          if (CompileTaskStore.getInstance().appPwd?.length === 0) {
            CompileTaskStore.getInstance().appPwd = undefined;
          }
        }



        if ((projectInfos.dbAppPwd  !== undefined && projectInfos.dbAppPwd?.length > 0) ||
            (CompileTaskStore.getInstance().appPwd !== undefined && (""+CompileTaskStore.getInstance().appPwd).length > 0)) {



            // const insidePackages = matchRuleShort(fileName, '*/db/*/sources/packages/*');
            const insideTests = matchRuleShort(fileName, '*/db/*/tests/packages/*');
            const fileExtension:string = ""+fileName.split('.').pop();
            const extensionAllowed = ConfigurationManager.getKnownSQLFileExtensions();


            if (extensionAllowed.map(ext => ext.toLowerCase()).includes(fileExtension.toLowerCase()) && (insideTests)) {
              which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
                TestTaskStore.getInstance().selectedSchemas = [testPackageTaskProvider.getDBUserFromPath(fileName, projectInfos)];
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
    context.subscriptions.push(testPackageTaskCommand);

    const testPackageTaskProviderDisposable = vscode.tasks.registerTaskProvider("dbFlux", testPackageTaskProvider);
    context.subscriptions.push(testPackageTaskProviderDisposable);


    // Reset Password
    const resetPwdCommand = vscode.commands.registerCommand("dbFlux.resetPassword", async () => {
      CompileTaskStore.getInstance().appPwd = undefined;
      vscode.window.showInformationMessage("dbFlux: Password succefully reset");
    });
    context.subscriptions.push(resetPwdCommand);

  } else {
    outputLog("no dbFlux configured");

    vscode.commands.executeCommand("setContext", "inDbFlowProject", false);
    return;
  }

}

// this method is called when your extension is deactivated
export function deactivate() {}

function applyFileExists(pMode:string) {
  return vscode.workspace.workspaceFolders
       && existsSync(path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, pMode === "dbFlow"?"apply.env":".xcl/env.yml"));
}
