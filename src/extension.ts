import { commands, ExtensionContext, StatusBarAlignment, StatusBarItem, tasks, WebviewPanel, window, workspace } from "vscode";

import { basename, join } from "path";
import { CompileTaskProvider, registerCompileFileCommand, registerCompileSchemasCommand } from "./provider/CompileTaskProvider";
import { ExportTaskProvider, registerExportAPEXCommand } from "./provider/ExportTaskProvider";

import { registerExportRESTCommand, RestTaskProvider } from "./provider/RestTaskProvider";
import { applyFileExists, getDBFlowMode, getProjectInfos } from "./provider/AbstractBashTaskProvider";
import { openTestResult, registerExecuteTestPackageCommand, registerExecuteTestsTaskCommand, TestTaskProvider } from "./provider/TestTaskProvider";
import { removeDBFluxConfig, showConfig, showDBFluxConfig } from "./helper/ConfigurationManager";
import { outputLog } from './helper/OutputChannel';
import { initializeProjectWizard, registerEnableFlexModeCommand, registerResetPasswordCommand } from './wizards/InitializeProjectWizard';
import { callSnippet, createObjectWizard, createTableDDL } from './wizards/CreateObjectWizard';
import { registerAddApplicationCommand, registerAddReportTypeFolderCommand, registerAddRESTModuleCommand, registerAddSchemaCommand, registerAddStaticApplicationFolderCommand, registerAddWorkspaceCommand, registerJoinFromFilesCommand, registerOpenSpecOrBody, registerSplitToFilesCommand } from "./provider/AddFolderCommands";
import { CompileSchemasProvider } from "./provider/CompileSchemasProvider";
import { registerWrapLogSelection, registerWrapLogSelectionDown, registerWrapLogSelectionUp } from "./provider/WrapLogProvider";
import { revealItemWizard } from "./wizards/RevealItemWizard";


export function activate(context: ExtensionContext) {
  // get Mode
  const dbFluxMode = getDBFlowMode(context);

  // Panel showing TestResults
  let webViewTestPanel: WebviewPanel | undefined = undefined;


  // Add Command reloadExtension > which reloads the extendion itself
  context.subscriptions.push(commands.registerCommand("dbFlux.reloadExtension", async () => {
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

  // Add Command wizard > create Initial Project Structure and DB Scripts
  context.subscriptions.push(commands.registerCommand('dbFlux.initializeProject', async () =>  initializeProjectWizard(context)));

  // Wrap Selection for Logging
  context.subscriptions.push(registerWrapLogSelection());
  context.subscriptions.push(registerWrapLogSelectionDown());
  context.subscriptions.push(registerWrapLogSelectionUp());


  // Following makes only sense, when project is allready configured
  if (   workspace.workspaceFolders
      && dbFluxMode !== undefined
      && ( (dbFluxMode === "dbFlux") || (["dbFlow", "xcl"].includes(dbFluxMode)
      && applyFileExists(dbFluxMode)))) {



    const projectInfos = getProjectInfos(context);

    // statusbaritem to indicate we can use dbFlux
    const myStatusBarItem: StatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 100);
    myStatusBarItem.command = 'dbFlux.showConfig';
    myStatusBarItem.text = `$(database) ${dbFluxMode}`;


    outputLog(`dbFlux-Mode is ${dbFluxMode} and FlexMode is ${projectInfos.isFlexMode}`);
    commands.executeCommand("setContext", "inDbFlowProject", true);
    commands.executeCommand("setContext", "isDbFlowFlexMode", projectInfos.isFlexMode);
    commands.executeCommand("setContext", "existsAppSchemas", );


    if (["dbFlow", "xcl"].includes(dbFluxMode) && workspace.workspaceFolders) {
      const applyFileName = join(workspace.workspaceFolders[0].uri.fsPath, dbFluxMode === "dbFlow"?"apply.env":".xcl/env.yml");
      const buildFileName = join(workspace.workspaceFolders[0].uri.fsPath, dbFluxMode === "dbFlow"?"build.env":"xcl.yml");
      myStatusBarItem.tooltip = `dbFlux: configuration found (${basename(buildFileName)}/${basename(applyFileName)})`;

      // Command to open build and applyFiles
      context.subscriptions.push(commands.registerCommand('dbFlux.showConfig', () => showConfig(applyFileName, buildFileName)));

    } else {
      myStatusBarItem.tooltip = `dbFlux: configuration found in workspaceState`;

      // Command to view dbFlux - Config
      context.subscriptions.push(commands.registerCommand('dbFlux.showConfig', () => showDBFluxConfig(context)));

      // Command to remove dbFlux - Config
      context.subscriptions.push(commands.registerCommand('dbFlux.removeConfiguration', () => removeDBFluxConfig(context)));

    }

    // just show the item
    myStatusBarItem.show();
    context.subscriptions.push(myStatusBarItem);

    // ============= COMMANDS =============

    // Add Command: Create an Object by Wizard => Choose a folder and name your file
    context.subscriptions.push(commands.registerCommand('dbFlux.createObjectWizard', async () => createObjectWizard(context)));

    // Add Command: Create a table DDL File => Choose Table from table folder
    context.subscriptions.push(commands.registerCommand('dbFlux.createTableDDL', async () => createTableDDL(context)));

    // Add Command to call a snippet when File is opened
    context.subscriptions.push( workspace.onDidOpenTextDocument((document) => callSnippet(workspace.workspaceFolders![0].uri.fsPath, document)));


    // Compile
    context.subscriptions.push(registerCompileFileCommand(context));
    context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new CompileTaskProvider(context)));


    // Export APEX
    context.subscriptions.push(registerExportAPEXCommand(context));
    context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new ExportTaskProvider(context)));


    // Enable FLEX Mode
    context.subscriptions.push(registerEnableFlexModeCommand(projectInfos, context));

    // Add APEX App
    context.subscriptions.push(registerAddApplicationCommand(projectInfos, context));

    // Add Workspace Folder
    context.subscriptions.push(registerAddWorkspaceCommand(projectInfos, context));

    // Add Schema Folder
    context.subscriptions.push(registerAddSchemaCommand(projectInfos, context));

    // Add static app folder
    context.subscriptions.push(registerAddStaticApplicationFolderCommand(projectInfos, context));

    // Add report type folder
    context.subscriptions.push(registerAddReportTypeFolderCommand());

    // Add REST Modul
    context.subscriptions.push(registerAddRESTModuleCommand(projectInfos, context));

    // Reveal Item
    context.subscriptions.push(commands.registerCommand('dbFlux.gotoToFolder', async () => revealItemWizard(context)));


    // Export REST
    context.subscriptions.push(registerExportRESTCommand(context));
    context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new RestTaskProvider(context)));


    // run tests on selected Schemas
    context.subscriptions.push(registerExecuteTestsTaskCommand(context));
    context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new TestTaskProvider(context, "executeTests")));


    // run test against current package
    context.subscriptions.push(registerExecuteTestPackageCommand(context));
    context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new TestTaskProvider(context, "executeTestPackage")));


    // Reset Password
    context.subscriptions.push(registerResetPasswordCommand());


    // compile selected Schemas
    context.subscriptions.push(registerCompileSchemasCommand(context));
    context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new CompileSchemasProvider(context, "compileSchemas")));

    // Separate parts of a file, when reference with something like that: -- File: xx/yy/ff.sql
    // So split content by "-- File: " and write to path underneath db/schema
    context.subscriptions.push(registerSplitToFilesCommand(projectInfos));

    // Join from Files (read them and put content after marker "-- File: ")
    context.subscriptions.push(registerJoinFromFilesCommand(projectInfos));

    // Open SpecOrBody
    context.subscriptions.push(registerOpenSpecOrBody());



    // Execute Something when task endet
    tasks.onDidEndTask((e) => {
      const task = e.execution.task;

      if (task.definition.type === "dbFlux"){

        switch (task.name) {
          case "executeTests" : {
            webViewTestPanel = openTestResult(context, webViewTestPanel);
            break;
          }
          case "executeTestPackage" : {
            webViewTestPanel = openTestResult(context, webViewTestPanel);
            break;
          }
        }

        // Reset when the current panel is closed
        webViewTestPanel?.onDidDispose(() => {
          webViewTestPanel = undefined;
          },
          null,
          context.subscriptions
        );
      }

    }, undefined, context.subscriptions);

  } else {
    outputLog("no dbFlux configured");

    commands.executeCommand("setContext", "inDbFlowProject", false);
    return;
  }

}


// this method is called when your extension is deactivated
export function deactivate() {}
