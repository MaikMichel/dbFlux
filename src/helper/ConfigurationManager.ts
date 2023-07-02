import { commands, ExtensionContext, languages, Uri, ViewColumn, window, workspace } from "vscode";
import { outputLog } from "./OutputChannel";

interface ICustomTriggerRuns {
  triggeringExpression: string,
  runFile:             string
  runFileParameters:   string[];
}

interface ICustomTriggerCalls {
  triggeringExpression: string,
  runMethod:           string,
  runMethodTargetFile: string
}

export class ConfigurationManager {

  static dbFlux:string = "dbFlux";
  static fileSeparation:string = "-- File: ";

  static get<T>(confPath:string):T {
    const myValue:T | undefined = workspace.getConfiguration(ConfigurationManager.dbFlux).get(confPath);
    const myDefault = workspace.getConfiguration(ConfigurationManager.dbFlux).inspect(confPath)?.defaultValue;
    return (myValue === undefined ? <T>myDefault : myValue);
  }

  static getCreateAndUploadJavaScriptMinifiedVersion():boolean {
    return this.get<boolean>("javaScriptModification.createAndUploadJavascriptMinifiedVersion");
  }

  static getCreateAndUploadJavaScriptSourceMap():boolean {
    return this.get<boolean>("javaScriptModification.createAndUploadJavascriptSourceMap");
  }

  static getCreateAndUploadCSSMinifiedVersion():boolean {
    return this.get<boolean>("cssModification.createAndUploadCSSMinifiedVersion");
  }

  static getCliToUseForCompilation():string {
    const cli = this.get<string>("cliToUseForCompilation");
    return (cli === "SQL*Plus" ? "sqlplus" : "sql");
  }

  static getShowWarningMessages():boolean {
    return this.get<boolean>("showWarningMessages.AfterCompilation");
  }

  static getUseSQLplusSPERRORLOGTable():boolean {
    return this.get<boolean>("configCLI.UseSQLplusSPERRORLOGTable");
  }

  static getFocusProblemPanelWhenExists():boolean {
    return this.get<boolean>("showWarningMessages.FocusProblemPanelWhenExists");
  }

  static getWarningsToExclude():string[] {
    return this.get<string[]>("showWarningMessages.AfterCompilationExcludingFollowingCodes");
  }

  static getKnownSQLFileExtensions():string[] {
    return this.get<string[]>("extensionsWhichShouldBeHandeldBySqlCli");
  }

  static getCustomTriggerRuns():ICustomTriggerRuns[] {
    return this.get<ICustomTriggerRuns[]>("customTriggerRuns");
  }

  static getCustomTriggerCalls():ICustomTriggerCalls[] {
    return this.get<ICustomTriggerCalls[]>("customTriggerCalls");
  }

  static getShowWarningsAndErrorsWithColoredOutput(): boolean {
    return this.get<boolean>("showWarningMessages.showWarningsAndErrorsWithColoredOutput");
  }

  static isDBLockEnabled(): boolean {
    return this.get<boolean>("dbLock.RestAPIEnabled");
  }

  static getDBLockRESTUrl(): string {
    return this.get<string>("dbLock.RestAPIUrl");
  }

  static getDBLockMandantToken(): string {
    return this.get<string>("dbLock.RestAPIToken");
  }

  static getTestOutputFormat(): string {
    return this.get<string>("test.Output.Format")
  }

  static getAppExportOptions(): string {
    return this.get<string>("exportApplications.AppendFollowingOptionString")
  }
}

export function showConfig(applyFileName:string, buildFileName:string){
    workspace.openTextDocument(Uri.file(applyFileName)).then(doc => {
      window.showTextDocument(doc, {preview: false});
    });

    workspace.openTextDocument(Uri.file(buildFileName)).then(doc => {
      window.showTextDocument(doc, {preview: false, viewColumn: ViewColumn.Beside});
    });
}

export function showDBFluxConfig(context:ExtensionContext){

  outputLog("Outputting Configuration", true);

  outputLog("DB_TNS: " + context.workspaceState.get("dbFlux_DB_TNS"));
  outputLog("DB_APP_USER: " + context.workspaceState.get("dbFlux_DB_APP_USER"));
  outputLog("DB_APP_PWD: " + context.workspaceState.get("dbFlux_DB_APP_PWD"));
  outputLog("DB_ADMIN_USER: " + context.workspaceState.get("dbFlux_DB_ADMIN_USER"));

  outputLog("PROJECT: " + context.workspaceState.get("dbFlux_PROJECT"));
  outputLog("PROJECT_MODE: " + context.workspaceState.get("dbFlux_PROJECT_MODE"));
  if (context.workspaceState.get("dbFlux_PROJECT_MODE") === "MULTI") {
    outputLog("DATA_SCHEMA: " + context.workspaceState.get("dbFlux_DATA_SCHEMA"));
    outputLog("LOGIC_SCHEMA: " + context.workspaceState.get("dbFlux_LOGIC_SCHEMA"));
    outputLog("APP_SCHEMA: " + context.workspaceState.get("dbFlux_APP_SCHEMA"));
  } else if (context.workspaceState.get("dbFlux_PROJECT_MODE") === "SINGLE") {
    outputLog("APP_SCHEMA: " + context.workspaceState.get("dbFlux_APP_SCHEMA"));
  }

  outputLog("WORKSPACE: " + context.workspaceState.get("dbFlux_WORKSPACE"));

}

export function removeDBFluxConfig(context:ExtensionContext){

  window.showInformationMessage("Do you realy want to remove you dbFlux configuration?", ... ["Yes", "No"])
    .then((answer) => {
      if (answer === "Yes") {

        rmDBFluxConfig(context);
        window.showInformationMessage(`Configuration successfully removed`);
      }
    });


}

export async function rmDBFluxConfig(context:ExtensionContext) {
  // Run function
  outputLog("Removing Configuration", true);

  context.workspaceState.update("dbFlux_mode", undefined);
  context.workspaceState.update("dbFlux_DB_TNS", undefined);
  context.workspaceState.update("dbFlux_DB_APP_USER", undefined);
  context.workspaceState.update("dbFlux_DB_APP_PWD", undefined);
  context.workspaceState.update("dbFlux_DB_ADMIN_USER", undefined);

  context.workspaceState.update("dbFlux_PROJECT", undefined);
  context.workspaceState.update("dbFlux_WORKSPACE", undefined);
  context.workspaceState.update("dbFlux_DATA_SCHEMA", undefined);
  context.workspaceState.update("dbFlux_LOGIC_SCHEMA", undefined);
  context.workspaceState.update("dbFlux_APP_SCHEMA", undefined);

  await commands.executeCommand("dbFlux.reloadExtension");
}

export function focusProblemPanel() {
  if (ConfigurationManager.getFocusProblemPanelWhenExists()) {
    let myEvent = languages.onDidChangeDiagnostics(event => {
      const myUri = window.activeTextEditor?.document.uri;
      if (myUri) {
        let matched = false;
        for (const euri of event.uris) {
          if (euri.path === myUri?.path) {
            matched = true;
          }
        }

        const diagnostics = languages.getDiagnostics(myUri);
        if (matched && diagnostics && diagnostics.length > 0) {
          commands.executeCommand("workbench.action.problems.focus");
          myEvent.dispose();
        }
      }

    });

  }
}