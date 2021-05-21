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

        let fileName = vscode.window.activeTextEditor?.document.fileName.split(path.sep).join('/')!;
        if (fileName === undefined) {
          await vscode.commands.executeCommand('copyFilePath');
          fileName = await vscode.env.clipboard.readText();
          fileName = fileName.split('\n')[0].split(path.sep).join('/')!;

          await vscode.env.clipboard.writeText(tmpClipboard);
        }
        const insideStatics = matchRuleShort(fileName, '*/static/f*/src/*');

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
        } else {
          vscode.window.showWarningMessage('Current filetype is not supported by dbFlow ...');
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
        ExportTaskStore.getInstance().expID = await ExportTaskStore.getInstance().getAppID();

        await vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlow: exportAPEX");
      }
    });
    context.subscriptions.push(exportCommand);

    const expTaskProvider: ExportTaskProvider = new ExportTaskProvider();
    const expTaskProviderDisposable = vscode.tasks.registerTaskProvider("dbFlow", expTaskProvider);
    context.subscriptions.push(expTaskProviderDisposable);

    // Add REST Modul
    const addApplicationCommand = vscode.commands.registerCommand("dbFlow.addAPP", async () => {
      ExportTaskStore.getInstance().addApplication(await ExportTaskStore.getInstance().getNewApplication());

    });
    context.subscriptions.push(addApplicationCommand);


    // Export REST
    const restCommand = vscode.commands.registerCommand("dbFlow.exportREST", async () => {
      projectInfos = getProjectInfos();
      if (projectInfos.isValid) {
        RestTaskStore.getInstance().restModule = await RestTaskStore.getInstance().getRestModule();

        await vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlow: exportREST");
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
        await vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlow: executeTests");
      }
    });
    context.subscriptions.push(testCommand);

    const testTaskProvider: TestTaskProvider = new TestTaskProvider();
    const testTaskProviderDisposable = vscode.tasks.registerTaskProvider("dbFlow", testTaskProvider);
    context.subscriptions.push(testTaskProviderDisposable);
  } else {
    vscode.window.showErrorMessage("dbFlow: Working folder not found, open a folder an try again");
    vscode.commands.executeCommand("setContext", "inDbFlowProject", false);
    return;
  }





}

// this method is called when your extension is deactivated
export function deactivate() {}
