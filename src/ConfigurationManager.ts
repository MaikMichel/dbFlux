import { workspace } from "vscode";

export class ConfigurationManager {
  public sqlExecutable: string;

  private static _instance: ConfigurationManager;

  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager._instance) {
      ConfigurationManager._instance = new ConfigurationManager();
    }

    return ConfigurationManager._instance;
  }

  private constructor() {
    // Read Configuration
    const extensionConfiguration = workspace.getConfiguration("dbFlow");

    this.sqlExecutable = extensionConfiguration.get("cliToUseForCompilation")!;
    this.sqlExecutable = this.sqlExecutable === "SQL*Plus" ? "sqlplus" : "sql";

  }


}
