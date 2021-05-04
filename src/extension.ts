import * as vscode from "vscode";
import {existsSync} from "fs";
import * as path from "path";
import { OraTaskProvider } from "./OraTaskProvider";

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
    if (!existsSync(buildFile)) {
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


  // Compile
  let sqlPlusCommand = vscode.commands.registerCommand("dbFlow.compileFile", () => {

    const langId = vscode.window.activeTextEditor?.document.languageId!;
    const fileName = vscode.window.activeTextEditor?.document.fileName.split(path.sep).join('/')!;
    const insideStatics = matchRuleShort(fileName, '*/static/f*/src*');

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

  const oraTaskProvider: OraTaskProvider = new OraTaskProvider();
  const oraTaskProviderDisposable = vscode.tasks.registerTaskProvider("dbFlow", oraTaskProvider);
  context.subscriptions.push(oraTaskProviderDisposable);


  // Export APEX
  const exportCommand = vscode.commands.registerCommand("dbFlow.exportAPEX", () => {
    console.log('AAAAAA');
    vscode.commands.executeCommand("workbench.action.tasks.runTask", "dbFlow: exportAPEX");
  });
  context.subscriptions.push(exportCommand);

  // const expTaskProvider: ExpTaskProvider = new ExpTaskProvider();
  // const expTaskProviderDisposable = vscode.tasks.registerTaskProvider("dbFlow", expTaskProvider);
  // context.subscriptions.push(expTaskProviderDisposable);


}

// this method is called when your extension is deactivated
export function deactivate() {}
