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
import * as os from 'os';
import { TestTaskProvider } from "./TestTaskProvider";
import { ReportTemplater } from "./ReportTemplater";
import { CompileTaskStore } from "./CompileTaskStore";
import { TestTaskStore } from "./TestTaskStore";
import { ConfigurationManager } from "./ConfigurationManager";
var which = require('which');






let myStatusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {

  const mode = getDBFlowMode();

  if (mode !== undefined && ["dbFlow", "xcl"].includes(mode)) {
    let projectInfos = getProjectInfos();


    let applyFileName:string = "";
    let buildFileName:string = "";

    if (vscode.workspace.workspaceFolders) {
      applyFileName = mode === "dbFlow" ? path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, "apply.env") :
                                          path.join(os.homedir + "/AppData/Roaming/xcl", `environment_${path.basename(vscode.workspace.workspaceFolders[0].uri.fsPath)}.yml`) ;

      buildFileName = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, mode === "dbFlow"?"build.env":"xcl.yml");
    }


    // Command to open buildFile
    context.subscriptions.push(vscode.commands.registerCommand('dbFlow.openApplyFile', () => {
        let openPath = vscode.Uri.file(applyFileName);
        vscode.workspace.openTextDocument(openPath).then(doc => {
          vscode.window.showTextDocument(doc);
        });

    }));

    context.subscriptions.push(vscode.commands.registerCommand('dbFlow.openBuildFile', () => {
      if (vscode.workspace.workspaceFolders) {
        let openPath = vscode.Uri.file(buildFileName);
        vscode.workspace.openTextDocument(openPath).then(doc => {
          vscode.window.showTextDocument(doc);
        });
      }
    }));


    // statusbaritem to indicate we can use dbFlow
    myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    myStatusBarItem.command = 'dbFlow.openBuildFile';
    myStatusBarItem.text = `$(database) ${mode}`;
    myStatusBarItem.tooltip = `dbFlow: configuration found (${path.basename(buildFileName)}/${path.basename(applyFileName)})`;
    myStatusBarItem.show();
    context.subscriptions.push(myStatusBarItem);


    vscode.commands.executeCommand("setContext", "inDbFlowProject", true);

    // Compile
    let sqlPlusCommand = vscode.commands.registerCommand("dbFlow.compileFile", async () => {
      projectInfos = getProjectInfos();

      if (projectInfos.isValid) {
        const tmpClipboard = await vscode.env.clipboard.readText();

        const langId = vscode.window.activeTextEditor?.document.languageId!;

        let fileName = vscode.window.activeTextEditor?.document.fileName.split(path.sep).join(path.posix.sep)!;


        if ((projectInfos.dbAppPwd === undefined && CompileTaskStore.getInstance().appPwd === undefined) || (CompileTaskStore.getInstance().appPwd !== undefined && (""+CompileTaskStore.getInstance().appPwd).length === 0)) {
          CompileTaskStore.getInstance().appPwd  = await vscode.window.showInputBox({ prompt: `dbFlow: Enter Password for connection ${projectInfos.dbAppUser}@${projectInfos.dbTns}` , placeHolder: "Password", password: true});
          if (CompileTaskStore.getInstance().appPwd?.length === 0) {
            CompileTaskStore.getInstance().appPwd = undefined;
          }
        }


        if ((projectInfos.dbAppPwd  !== undefined && projectInfos.dbAppPwd?.length > 0) ||
            (CompileTaskStore.getInstance().appPwd !== undefined && (""+CompileTaskStore.getInstance().appPwd).length > 0)) {
          if (fileName === undefined) {
            await vscode.commands.executeCommand('copyFilePath');
            fileName = await vscode.env.clipboard.readText();
            fileName = fileName.split('\n')[0].split(path.sep).join(path.posix.sep)!;

            await vscode.env.clipboard.writeText(tmpClipboard);
          }
          const insideStatics = matchRuleShort(fileName, '*/static/f*/src/*');
          const insideReports = matchRuleShort(fileName, '*/reports/*');

          which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
            if (['sql', 'plsql'].includes(langId)) {
              vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlow: compileFile");
            } else if (insideStatics && ['javascript'].includes(langId)) {
              const tersered = new Terserer(fileName);
              tersered.genFile();
              vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlow: compileFile");

            } else if (insideStatics && ['css'].includes(langId)) {
              const uglifyer = new Uglifyer(fileName);
              uglifyer.genFile();
              vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlow: compileFile");
            } else if (insideStatics) {
              const simpleUploader = new SimpleUploader(fileName);
              simpleUploader.genFile();
              vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlow: compileFile");
            } else if (insideReports) {
              const reportTemplater = new ReportTemplater(fileName);
              reportTemplater.genFile();
              // vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlow: compileFile");
            } else {
              vscode.window.showWarningMessage('Current filetype is not supported by dbFlow ...');
            }
          }).catch(() => {
            vscode.window.showErrorMessage(`dbFlow: No executable ${ConfigurationManager.getCliToUseForCompilation()} found on path!`);
          });

        } else {
          vscode.window.showWarningMessage('No password provided ... nothing to do ...');
        }
      }
    });

    context.subscriptions.push(sqlPlusCommand);

    const oraTaskProvider: CompileTaskProvider = new CompileTaskProvider();
    const oraTaskProviderDisposable = vscode.tasks.registerTaskProvider("dbFlow", oraTaskProvider);
    context.subscriptions.push(oraTaskProviderDisposable);



    // Export APEX
    const exportCommand = vscode.commands.registerCommand("dbFlow.exportAPEX", async () => {
      projectInfos = getProjectInfos();
      if (projectInfos.isValid) {

        if ((projectInfos.dbAppPwd === undefined && CompileTaskStore.getInstance().appPwd === undefined) || (CompileTaskStore.getInstance().appPwd !== undefined && (""+CompileTaskStore.getInstance().appPwd).length === 0)) {
          CompileTaskStore.getInstance().appPwd  = await vscode.window.showInputBox({ prompt: `dbFlow: Enter Password for connection ${projectInfos.dbAppUser}@${projectInfos.dbTns}` , placeHolder: "Password", password: true});
          if (CompileTaskStore.getInstance().appPwd?.length === 0) {
            CompileTaskStore.getInstance().appPwd = undefined;
          }
        }


        if ((projectInfos.dbAppPwd  !== undefined && projectInfos.dbAppPwd?.length > 0) ||
            (CompileTaskStore.getInstance().appPwd !== undefined && (""+CompileTaskStore.getInstance().appPwd).length > 0)) {
          ExportTaskStore.getInstance().expID = await ExportTaskStore.getInstance().getAppID();

          which('sql').then(async () => {
            await vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlow: exportAPEX");
          }).catch(() => {
            vscode.window.showErrorMessage('dbFlow: No executable "sql" found on path!');
          });


        }
      }
    });


    context.subscriptions.push(exportCommand);


    const expTaskProvider: ExportTaskProvider = new ExportTaskProvider();
    const expTaskProviderDisposable = vscode.tasks.registerTaskProvider("dbFlow", expTaskProvider);
    context.subscriptions.push(expTaskProviderDisposable);

    // Add APEX App
    const addApplicationCommand = vscode.commands.registerCommand("dbFlow.addAPP", async () => {
      ExportTaskStore.getInstance().addApplication(await ExportTaskStore.getInstance().getNewApplication());

    });
    context.subscriptions.push(addApplicationCommand);

    // Add static app folder
    const addStaticAppFolder = vscode.commands.registerCommand("dbFlow.addStaticFolder", async () => {
      ExportTaskStore.getInstance().addStaticFolder(await ExportTaskStore.getInstance().getNewApplication());

    });
    context.subscriptions.push(addStaticAppFolder);

    // Add report type folder
    const addReportTypeFolder = vscode.commands.registerCommand("dbFlow.addReportFolder", async () => {
      ExportTaskStore.getInstance().addReportTypeFolder(await ExportTaskStore.getInstance().getReportType());

    });
    context.subscriptions.push(addReportTypeFolder);

    // Export REST
    const restCommand = vscode.commands.registerCommand("dbFlow.exportREST", async () => {
      projectInfos = getProjectInfos();
      if (projectInfos.isValid) {

        if ((projectInfos.dbAppPwd === undefined && CompileTaskStore.getInstance().appPwd === undefined) || (CompileTaskStore.getInstance().appPwd !== undefined && (""+CompileTaskStore.getInstance().appPwd).length === 0)) {
          CompileTaskStore.getInstance().appPwd  = await vscode.window.showInputBox({ prompt: `dbFlow: Enter Password for connection ${projectInfos.dbAppUser}@${projectInfos.dbTns}` , placeHolder: "Password", password: true});
          if (CompileTaskStore.getInstance().appPwd?.length === 0) {
            CompileTaskStore.getInstance().appPwd = undefined;
          }
        }


        if ((projectInfos.dbAppPwd  !== undefined && projectInfos.dbAppPwd?.length > 0) ||
            (CompileTaskStore.getInstance().appPwd !== undefined && (""+CompileTaskStore.getInstance().appPwd).length > 0)) {

          which('sql').then(async () => {
            RestTaskStore.getInstance().restModule = await RestTaskStore.getInstance().getRestModule();

            await vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlow: exportREST");
          }).catch(() => {
            vscode.window.showErrorMessage('dbFlow: No executable "sql" found on path!');
          });
        }
      }
    });
    context.subscriptions.push(restCommand);

    const restTaskProvider: RestTaskProvider = new RestTaskProvider();
    const restTaskProviderDisposable = vscode.tasks.registerTaskProvider("dbFlow", restTaskProvider);
    context.subscriptions.push(restTaskProviderDisposable);


    // Add REST Modul
    const addRestModulCommand = vscode.commands.registerCommand("dbFlow.addREST", async () => {
      RestTaskStore.getInstance().addRestModul(await RestTaskStore.getInstance().getNewRestModule());

    });
    context.subscriptions.push(addRestModulCommand);



    // run tests
    const testCommand = vscode.commands.registerCommand("dbFlow.executeTests", async () => {
      projectInfos = getProjectInfos();
      if (projectInfos.isValid) {
        if ((projectInfos.dbAppPwd === undefined && CompileTaskStore.getInstance().appPwd === undefined) || (CompileTaskStore.getInstance().appPwd !== undefined && (""+CompileTaskStore.getInstance().appPwd).length === 0)) {
          CompileTaskStore.getInstance().appPwd  = await vscode.window.showInputBox({ prompt: `dbFlow: Enter Password for connection ${projectInfos.dbAppUser}@${projectInfos.dbTns}` , placeHolder: "Password", password: true});
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
                await vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlow: executeTests");
              }).catch(() => {
                vscode.window.showErrorMessage(`dbFlow: No executable ${ConfigurationManager.getCliToUseForCompilation()} found on path!`);
              });
        }
      }
    });
    context.subscriptions.push(testCommand);

    const testTaskProvider: TestTaskProvider = new TestTaskProvider("executeTests");
    const testTaskProviderDisposable = vscode.tasks.registerTaskProvider("dbFlow", testTaskProvider);
    context.subscriptions.push(testTaskProviderDisposable);



    // run test against package
    const testPackageTaskProvider: TestTaskProvider = new TestTaskProvider("executeTestPackage");
    const testPackageTaskCommand = vscode.commands.registerCommand("dbFlow.executeTestPackage", async () => {
      projectInfos = getProjectInfos();
      if (projectInfos.isValid) {

        const tmpClipboard = await vscode.env.clipboard.readText();
        const langId = vscode.window.activeTextEditor?.document.languageId!;
        let fileName = vscode.window.activeTextEditor?.document.fileName.split(path.sep).join(path.posix.sep)!;

        if ((projectInfos.dbAppPwd === undefined && CompileTaskStore.getInstance().appPwd === undefined) || (CompileTaskStore.getInstance().appPwd !== undefined && (""+CompileTaskStore.getInstance().appPwd).length === 0)) {
          CompileTaskStore.getInstance().appPwd  = await vscode.window.showInputBox({ prompt: `dbFlow: Enter Password for connection ${projectInfos.dbAppUser}@${projectInfos.dbTns}` , placeHolder: "Password", password: true});
          if (CompileTaskStore.getInstance().appPwd?.length === 0) {
            CompileTaskStore.getInstance().appPwd = undefined;
          }
        }


        if ((projectInfos.dbAppPwd  !== undefined && projectInfos.dbAppPwd?.length > 0) ||
            (CompileTaskStore.getInstance().appPwd !== undefined && (""+CompileTaskStore.getInstance().appPwd).length > 0)) {


            if (fileName === undefined) {
              await vscode.commands.executeCommand('copyFilePath');
              fileName = await vscode.env.clipboard.readText();
              fileName = fileName.split('\n')[0].split(path.sep).join(path.posix.sep)!;

              await vscode.env.clipboard.writeText(tmpClipboard);
            }
            const insidePackages = matchRuleShort(fileName, '*/db/*/sources/packages/*');
            const insideTests = matchRuleShort(fileName, '*/db/*/tests/packages/*');

            if (['sql', 'plsql'].includes(langId) && (insidePackages || insideTests)) {
              which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
                TestTaskStore.getInstance().selectedSchemas = [testPackageTaskProvider.getDBUserFromPath(fileName, projectInfos)];
                TestTaskStore.getInstance().fileName = fileName;
                vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlow: executeTestPackage");
              }).catch(() => {
                vscode.window.showErrorMessage(`dbFlow: No executable ${ConfigurationManager.getCliToUseForCompilation()} found on path!`);
              });
            } else {
              vscode.window.showWarningMessage('Current filetype is not supported by dbFlow ...');
            }
        }
      }
    });
    context.subscriptions.push(testPackageTaskCommand);

    const testPackageTaskProviderDisposable = vscode.tasks.registerTaskProvider("dbFlow", testPackageTaskProvider);
    context.subscriptions.push(testPackageTaskProviderDisposable);


    // Reset Password
    const resetPwdCommand = vscode.commands.registerCommand("dbFlow.resetPassword", async () => {
      CompileTaskStore.getInstance().appPwd = undefined;
      vscode.window.showInformationMessage("dbFlow: Password succefully reset");
    });
    context.subscriptions.push(resetPwdCommand);

  } else {
    vscode.window.showErrorMessage("dbFlow: Working folder not found, open a folder an try again");
    vscode.commands.executeCommand("setContext", "inDbFlowProject", false);
    return;
  }

}

// this method is called when your extension is deactivated
export function deactivate() {}
