import * as path from "path";
import * as vscode from "vscode";
import * as fs from "fs";
import * as dotenv from "dotenv";

export interface IBashInfos {
  runFile:        string;
  connectionTns:  string;
  connectionUser: string;
  connectionPass: string;
  cwd:            string;
}

export abstract class AbstractBashTaskProvider {


  findClosestEnvFile(pathname: string, filename: string): string | undefined {
    let file = path.join(pathname, filename);
    let filePath = pathname;

    if (vscode.workspace.workspaceFolders !== undefined) {
      const wsf = vscode.workspace.workspaceFolders[0].uri.fsPath;
      let i = 0;

      while (i < 10 && (file.indexOf(wsf) < 0 || !fs.existsSync(file))) {
        i++;
        const folders = filePath.split(path.sep);
        folders.pop();
        filePath = folders.join(path.sep);
        file = path.join(filePath, filename);
      }
    } else {
      throw new Error("not workspacefolder opened");
    }

    if (!fs.existsSync(file)) {
      throw new Error(filename + " not found");
    }

    return file;
  }

  getDBUserFromPath(pathName: string, buildEnv: dotenv.DotenvConfigOutput): string {
    let returnDBUser: string|undefined = buildEnv.parsed?.APP_SCHEMA!.toLowerCase(); // sql File inside static or rest
    if (pathName.includes("db" + path.sep + buildEnv.parsed?.DATA_SCHEMA!.toLowerCase())) {
      returnDBUser = buildEnv.parsed?.DATA_SCHEMA!.toLowerCase();
    } else if (pathName.includes("db" + path.sep + buildEnv.parsed?.LOGIC_SCHEMA!.toLowerCase())) {
      returnDBUser = buildEnv.parsed?.LOGIC_SCHEMA!.toLowerCase();
    } else if (pathName.includes("db" + path.sep + buildEnv.parsed?.APP_SCHEMA!.toLowerCase())) {
      returnDBUser = buildEnv.parsed?.APP_SCHEMA!.toLowerCase();
    }
    return returnDBUser+"";
  }

  // TODO: Validate existence of vars
  buildConnectionUser(applyEnv: dotenv.DotenvConfigOutput, buildEnv: dotenv.DotenvConfigOutput, currentPath: string): string {
    if (buildEnv.parsed?.USE_PROXY === "FALSE") {
      return `${applyEnv.parsed?.DB_APP_USER}`;
    } else {
      let dbSchemaFolder = this.getDBUserFromPath(currentPath, buildEnv);

      return `${applyEnv.parsed?.DB_APP_USER}[${dbSchemaFolder}]`;
    }
  }

  // TODO: Validate existence of vars
  getAppConnection(applyEnv: dotenv.DotenvConfigOutput, buildEnv: dotenv.DotenvConfigOutput): string {
    if (buildEnv.parsed?.USE_PROXY === "FALSE") {
      return `${applyEnv.parsed?.DB_APP_USER}`;
    } else {
      return `${applyEnv.parsed?.DB_APP_USER}[${buildEnv.parsed?.APP_SCHEMA}]`;
    }
  }

  getAppConnectionUser(applyEnv: dotenv.DotenvConfigOutput, buildEnv: dotenv.DotenvConfigOutput): string {
    if (buildEnv.parsed?.USE_PROXY === "FALSE") {
      return `${applyEnv.parsed?.DB_APP_USER}`;
    } else {
      return `${applyEnv.parsed?.DB_APP_USER}[${buildEnv.parsed?.APP_SCHEMA}]`;
    }
  }
}