import { workspace } from "vscode";

interface ICustomTriggerRuns {
  triggeringExpression: string,
  runFile: string
  runFileParameters: string[];
}
export class ConfigurationManager {

  static dbFlux:string = "dbFlux";

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

  static getWarningsToExclude():string[] {
    return this.get<string[]>("showWarningMessages.AfterCompilationExcludingFollowingCodes");
  }

  static getKnownSQLFileExtensions():string[] {
    return this.get<string[]>("extensionsWhichShouldBeHandeldBySqlCli");
  }

  static getCustomTriggerRuns():ICustomTriggerRuns[] {
    return this.get<ICustomTriggerRuns[]>("customTriggerRuns");
  }

  static getShowWarningsAndErrorsWithColoredOutput(): boolean {
    return this.get<boolean>("showWarningMessages.showWarningsAndErrorsWithColoredOutput");
  }
}
