import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as ChildProcess from "child_process";
import * as Handlebars from "handlebars";
import { OraTaskProvider } from "./OraTaskProvider";
import * as dotenv from "dotenv";
import { Terserer } from "./Terserer";
import { matchRuleShort } from "./utilities";
import { Uglifyer } from "./Uglifyer";



export function activate(context: vscode.ExtensionContext) {
  // prüfen ob hier dbFlow oder xcl
  const buildSystem = "dbFlow";

  // dann prüfen, ob file exisiter
  const buildFileCheck = buildSystem === "dbFlow" ? "apply.env" : "xcl.yml";

  let message;
  if (vscode.workspace.workspaceFolders !== undefined) {
    let wf = vscode.workspace.workspaceFolders[0].uri.path;
    let f = vscode.workspace.workspaceFolders[0].uri.fsPath;
    let buildFile = path.join(f, buildFileCheck);
    if (!fs.existsSync(buildFile)) {
      vscode.window.showWarningMessage(`dbFlow: file not found: ${buildFile}`);
      return;
    } else {
      vscode.commands.executeCommand("setContext", "inDbFlowProject", true);
    }
  } else {
    message = "dbFlow: Working folder not found, open a folder an try again";

    vscode.window.showErrorMessage(message);
    vscode.commands.executeCommand("setContext", "inDbFlowProject", false);
    return;
  }


  let sqlPlusCommand = vscode.commands.registerCommand("dbFlow.compileFile", () => {

    const langId = vscode.window.activeTextEditor?.document.languageId!;
    const fileName = vscode.window.activeTextEditor?.document.fileName.split(path.sep).join('/')!;
    const insideStatics = matchRuleShort(fileName, '*/static/f*/src*');
    // console.log(fileName, insideStatics);

    if (['sql', 'plsql'].includes(langId)) {
      vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlow: compileFile");
    } else if (insideStatics && ['javascript'].includes(langId)) {
      const tersered = new Terserer(fileName);
      tersered.genFile();
      vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlow: compileFile");

    } else if (insideStatics && ['css'].includes(langId)) {
      const uflifyer = new Uglifyer(fileName);
      uflifyer.genFile();
      vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlow: compileFile");
    } else if (insideStatics) {
      // FIXME: Das geht noch nicht!
      vscode.window.showWarningMessage(`dbFlow: upload`);
    } else {
      vscode.window.showWarningMessage('Current filetype is not supported by dbFlow ...');
    }
  });

  context.subscriptions.push(sqlPlusCommand);

  let taskProvider: OraTaskProvider;
  taskProvider = new OraTaskProvider();
  let taskProviderDisposable = vscode.tasks.registerTaskProvider("dbFlow", taskProvider);
  context.subscriptions.push(taskProviderDisposable);

  let disposable = vscode.commands.registerCommand("dbFlow.test", () => {
    vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "hello" }, (p) => {
      return new Promise<void>((resolve, reject) => {
        p.report({ message: "Start working..." });
        let count = 0;
        let handle = setInterval(() => {
          count++;
          p.report({ message: "Worked " + count + " steps" });
          if (count >= 10) {
            clearInterval(handle);
            resolve();
          }
        }, 1000);
      });
    });
  });

  context.subscriptions.push(disposable);



}

// this method is called when your extension is deactivated
export function deactivate() {}
