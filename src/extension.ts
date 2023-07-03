import { commands, ExtensionContext, StatusBarAlignment, StatusBarItem, tasks, window, workspace } from "vscode";

import { basename, join } from "path";
import { registerCompileFileCommand, registerCompileSchemasCommand, registerRunSQLcli } from "./provider/CompileTaskProvider";
import { registerExportAPEXCommand } from "./provider/ExportTaskProvider";

import { registerExportRESTCommand } from "./provider/RestTaskProvider";
import { applyFileExists, getDBFlowMode, getProjectInfos} from "./provider/AbstractBashTaskProvider";
import { openTestResult, registerExecuteTestPackageCommand, registerExecuteTestsTaskCommand } from "./provider/TestTaskProvider";
import { ConfigurationManager, removeDBFluxConfig, rmDBFluxConfig, showConfig, showDBFluxConfig } from "./helper/ConfigurationManager";
import { outputLog } from './helper/OutputChannel';
import { initializeProjectWizard, registerEnableFlexModeCommand, registerResetPasswordCommand } from './wizards/InitializeProjectWizard';
import { callSnippet, createObjectWizard, createTableDDL } from './wizards/CreateObjectWizard';
import { registerAddApplicationCommand, registerAddHookFileCommand, registerAddReportTypeFolderCommand, registerAddRESTModuleCommand, registerAddSchemaCommand, registerAddStaticApplicationFolderCommand, registerAddWorkspaceCommand, registerCopyFunctionWithPackagenameToClipBoard, registerJoinFromFilesCommand, registerOpenSpecOrBody, registerReverseBuildFromFilesCommand, registerSplitToFilesCommand } from "./provider/AddFolderCommands";
import { registerWrapLogSelection, registerWrapLogSelectionDown, registerWrapLogSelectionUp } from "./provider/WrapLogProvider";
import { revealItemWizard } from "./wizards/RevealItemWizard";
import { registerExportDBObjectCommand, registerExportDBSchemaCommand } from "./provider/ExportDBSchemaProvider";
import { extensionManager } from "./provider/UpdateInfoProvider";
import { registerLockCurrentFileCommand, registerregisterRefreshLockedFiles, registerUnLockCurrentFileCommand, ViewFileDecorationProvider } from "./provider/ViewFileDecorationProvider";
import { registerExportCurrentStaticFileCommand, registerExportStaticFilesCommand } from "./provider/ExportStaticFilesProvider";
import { registerRemoveCurrentStaticFileCommand } from "./provider/RemoveStaticFileProvider";
import { DBLockTreeView } from "./ui/DBLockTreeView";

import { registerConvert2dbFLow } from "./provider/ConvertToDBFlow";
import { registerCreateDBFlowProject } from "./provider/GenerateDPFlowProjectProvider";
import { registerExportCurrentTableDefinitionCommand } from "./provider/ExportTableAsJSONProvider";
// import { PlsqlCompletionItemProvider } from "./provider/PlsqlCompletionItemProvider";
// import { ApplicationItemsCompletitionProvider } from "./provider/ApplicationItemsCompletitionProvider";






export async function activate(context: ExtensionContext) {
  await extensionManager.init();

  const installationType = extensionManager.getInstallationType();

  if ((installationType.update) && await extensionManager.askShowChangelog()) {
    extensionManager.showChangeLog();
  }

  // get Mode
  const dbFluxMode = getDBFlowMode(context);

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

  // Add Command wizard > create Initial Project Structure and DB Scripts as dbFlow Project
  context.subscriptions.push(registerCreateDBFlowProject("dbFlux.initialize.dbFlow.Project", context));

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
    commands.executeCommand("setContext", "dbLockEnabled", ConfigurationManager.isDBLockEnabled());
    commands.executeCommand("setContext", "isDbFlowFlexMode", projectInfos.isFlexMode);
    commands.executeCommand("setContext", "existsAppSchemas", );
    commands.executeCommand("setContext", "isDBFluxMode", (dbFluxMode === "dbFlux"));


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
    context.subscriptions.push(registerCompileFileCommand(projectInfos, context));
    context.subscriptions.push(registerCompileFileCommand(projectInfos, context, 'dbFlux.runTriggerForCurrentFile'));


    // Export APEX
    context.subscriptions.push(registerExportAPEXCommand(projectInfos, context));

    // Export DBSchema
    context.subscriptions.push(registerExportDBSchemaCommand(projectInfos, context));

    // Export DBObject
    context.subscriptions.push(registerExportDBObjectCommand(projectInfos, context));



    // Export APEX Static Files
    context.subscriptions.push(registerExportStaticFilesCommand(projectInfos, context));


    // Export one APEX Static File
    context.subscriptions.push(registerExportCurrentStaticFileCommand(projectInfos, context));

    // Remove current APEX Static File
    context.subscriptions.push(registerRemoveCurrentStaticFileCommand(projectInfos, context));

    // Export current Table Definition
    context.subscriptions.push(registerExportCurrentTableDefinitionCommand(projectInfos, context));

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

    // Add hook file
    context.subscriptions.push(registerAddHookFileCommand(context));

    // Add REST Modul
    context.subscriptions.push(registerAddRESTModuleCommand(projectInfos, context));

    // Reveal Item
    context.subscriptions.push(commands.registerCommand('dbFlux.gotoToFolder', async () => revealItemWizard(context)));


    // Export REST
    context.subscriptions.push(registerExportRESTCommand(projectInfos, context));


    // run tests on selected Schemas
    context.subscriptions.push(registerExecuteTestsTaskCommand(projectInfos, context));


    // run test against current package
    context.subscriptions.push(registerExecuteTestPackageCommand(projectInfos, context));

    // RUN SQLplus or SQLcl
    context.subscriptions.push(registerRunSQLcli(projectInfos, "dbFlux.run.SQLcl", "sql"));
    context.subscriptions.push(registerRunSQLcli(projectInfos, "dbFlux.run.SQLplus", "sqlplus"));

    // Reset Password
    context.subscriptions.push(registerResetPasswordCommand());


    // compile selected Schemas
    context.subscriptions.push(registerCompileSchemasCommand(projectInfos, context));

    // Separate parts of a file, when reference with something like that: -- File: xx/yy/ff.sql
    // So split content by "-- File: " and write to path underneath db/schema
    context.subscriptions.push(registerSplitToFilesCommand(projectInfos));

    // Join from Files (read them and put content after marker "-- File: ")
    context.subscriptions.push(registerJoinFromFilesCommand(projectInfos));

    // Reverse build splitted File
    context.subscriptions.push(registerReverseBuildFromFilesCommand(projectInfos));

    // Open SpecOrBody
    context.subscriptions.push(registerOpenSpecOrBody());
    context.subscriptions.push(registerCopyFunctionWithPackagenameToClipBoard());

    // Convert current project to dbFlow project
    context.subscriptions.push(registerConvert2dbFLow(projectInfos, "dbFlux.convert.to.dbFlow", context));

    if (ConfigurationManager.isDBLockEnabled()) {

      // dbLock FileDecodations
      const decoProvider = new ViewFileDecorationProvider(context)

      //create a local tree view and register it in vscode
      const tree = new DBLockTreeView(decoProvider);
      context.subscriptions.push(window.registerTreeDataProvider('dbflux.dblock.treeview', tree));

      context.subscriptions.push(decoProvider);
      setTimeout(() => {
        tree.refresh();
        // decoProvider.refreshCache();
      }, 100);

      context.subscriptions.push(registerLockCurrentFileCommand(projectInfos, decoProvider));
      context.subscriptions.push(registerUnLockCurrentFileCommand(projectInfos, decoProvider));
      context.subscriptions.push(registerregisterRefreshLockedFiles(decoProvider));

    }


    // context.subscriptions.push(languages.registerCompletionItemProvider('plsql', new PlsqlCompletionItemProvider(), '.'));
    // context.subscriptions.push(languages.registerCompletionItemProvider({language: 'plsql'}, new ApplicationItemsCompletitionProvider(), 'P', 'p'));



    // Execute Something when task endet
    tasks.onDidEndTask((e) => {
      const task = e.execution.task;

      if (task.definition.type === "dbFlux"){

        outputLog(task.name + " done");
        switch (task.name) {
          case "executeTests" : {
            openTestResult(context);
            break;
          }
          case "executeTestPackage" : {
            openTestResult(context);
            break;
          }
          case "convert2dbFlow" : {
            rmDBFluxConfig(context);
            window.showInformationMessage(`dbFLux Mode is now: 'dbFlow'`);
            break;
          }
          case "createDBFlow" : {
            window.showInformationMessage(`dbFlow Project initialized, reloading extension settings`);
            commands.executeCommand("dbFlux.reloadExtension")
            break;
          }
          // case "exportCurrentTableAsJSONDefinition" : {
          //   processTableJSON(projectInfos, context);
          //   break;
          // }
          // case "compileFile" : {
          //   lockFileByRest(task, projectInfos, decoProvider);
          //   break;
          // }
        }

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
