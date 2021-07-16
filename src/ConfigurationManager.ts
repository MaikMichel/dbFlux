import { workspace } from "vscode";

interface ICustomTriggerRuns {
  triggeringExpression: string,
  runFile: string
  runFileParameters: string[];
}
export class ConfigurationManager {

  static dbFlow:string = "dbFlow";

  static get<T>(confPath:string):T {
    const myValue:T | undefined = workspace.getConfiguration(ConfigurationManager.dbFlow).get(confPath);
    const myDefault = workspace.getConfiguration(ConfigurationManager.dbFlow).inspect(confPath)?.defaultValue;
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

  static getWarningsToExclude():string[] {
    return this.get<string[]>("showWarningMessages.AfterCompilationExcludingFollowingCodes");
  }

  static getCustomTriggerRuns():ICustomTriggerRuns[] {
    return this.get<ICustomTriggerRuns[]>("customTriggerRuns");
  }

  static getShowWarningsAndErrorsWithColoredOutput(): boolean {
    return this.get<boolean>("showWarningMessages.showWarningsAndErrorsWithColoredOutput");
  }
}
