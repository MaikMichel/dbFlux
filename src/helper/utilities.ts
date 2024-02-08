import * as path from "path";
import * as vscode from "vscode";
import { existsSync, mkdirSync, readdirSync} from "fs";
import { platform } from "os";
import { exec } from "child_process";
import { LoggingService } from "./LoggingService";

const isWindows = platform() === 'win32'

export interface KeyVal {
  key: string;
  value: string;
}

export function matchRuleShort(str:string, rule:string) {
  var escapeRegex = (str:string) => str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
  return new RegExp("^" + rule.split("*").map(escapeRegex).join(".*") + "$").test(str);
}

export function getLastFolderFromFolderPath(sourcePath: string|undefined) {
  if (sourcePath === undefined) {
    return undefined;
  } else {
    const pathes = sourcePath.split(path.posix.sep);
    return pathes[pathes.length-1];
  }
}

export function getAllFoldersButNotTheLastFolder(sourcePath: string|undefined) {
  if (sourcePath === undefined) {
    return undefined;
  } else {
    const pathes = sourcePath.split(path.posix.sep);
    pathes.splice(-1);
    return pathes.join(path.posix.sep);
  }
}

export function getWorkspaceRootPath():string {
  let wsf = "";
  if (vscode.workspace.workspaceFolders !== undefined) {
    wsf = vscode.workspace.workspaceFolders[0].uri.fsPath.replace(/\\/g, '/');
    wsf = toUpperDriverLetter(wsf);
  }
  return wsf;
}

export function toUpperDriverLetter(wsf: string) {
  let filePath:string = wsf;
  if (isWindows && path.isAbsolute(filePath)) {
    filePath = ltrim(wsf, '/');
    const segments = filePath.split('/');
    const first = segments.shift()?.toUpperCase();
    filePath = first + '/' + segments.join('/');
  }
  return filePath;
}

export function ltrim (s:string, c:string) {
  if (c === "]") c = "\\]";
  if (c === "^") c = "\\^";
  if (c === "\\") c = "\\\\";
  return s.replace(new RegExp("^[" + c + "]+|[" + c + "]+$", "g"), "");
}

export function rtrim (s:string, c:string) {
  if (s === undefined) s = '\\s';
  return s.replace(new RegExp("[" + c + "]*$"), '');
};

// function rtrim(str:string, chr:string) {
//   var rgxtrim = (!chr) ? new RegExp('\\s+$') : new RegExp(chr+'+$');
//   return str.replace(rgxtrim, '');
// }

export function getApplicationIdFromPath(pathType: "static"|"apex", sourceFile: string, isFlexMode: boolean) {
  if (isFlexMode) {
    // */[static|apex]/scheman_name/workspace_name/f_with_app_id/src/*
    const wsRoot = getWorkspaceRootPath();
    const parts = sourceFile.replace(wsRoot+"/", "").split("/");
    const appID = parts[3].substring(1);
    return appID;
  } else {
    return sourceFile.split(pathType + '/f')[1].split('/src/')[0];
  }
}

export function getApplicationIdFromStaticPath(sourceFile: string, isFlexMode: boolean) {
  return getApplicationIdFromPath("static", sourceFile, isFlexMode);
  if (isFlexMode) {
    // */static/scheman_name/workspace_name/f_with_app_id/src/*
    const wsRoot = getWorkspaceRootPath();
    const parts = sourceFile.replace(wsRoot+"/", "").split("/");
    const appID = parts[3].substring(1);
    return appID;
  } else {
    return sourceFile.split('static/f')[1].split('/src/')[0];
  }
}

export function getApplicationIdFromApexPath(sourceFile: string, isFlexMode: boolean) {
  return getApplicationIdFromPath("apex", sourceFile, isFlexMode);
  if (isFlexMode) {
    // */static/scheman_name/workspace_name/f_with_app_id/src/*
    const wsRoot = getWorkspaceRootPath();
    const parts = sourceFile.replace(wsRoot+"/", "").split("/");
    const appID = parts[3].substring(1);
    return appID;
  } else {
    return sourceFile.split('static/f')[1].split('/src/')[0];
  }
}

export function getTargetPathFromFileName(inAppID: string, sourceFile: string) {
    return sourceFile.split('/f'+inAppID+'/src/')[1];

}

export function getStaticReference(sourceFile: string, isFlexMode: boolean) {
  const inAppID = getApplicationIdFromStaticPath(sourceFile, isFlexMode);
  const targetPath = getTargetPathFromFileName(inAppID, sourceFile);

  return "#APP_FILES#" + targetPath.replace(".js.sql", "#MIN#.js").replace(".css.sql", "#MIN#.css").replace(".sql", "");
}

export function changeExtension(filename: string, extension: string): string {
  let ext: string = path.extname(filename);
  let root: string = filename.substring(0, filename.length - ext.length);

  ext = extension.startsWith('.') ? extension : extension.length > 0 ? `.${extension}` : '';
  return `${root}${ext}`;
}

export function groupByKey(array: any[], key: string | number) {
  return array
    .reduce((hash: { [x: string]: any; }, obj: { [x: string]: string | number; }) => {
      if(obj[key] === undefined) {
        return hash;
      } else {
        return Object.assign(hash, { [obj[key]]:( hash[obj[key]] || [] ).concat(obj)});
      }
    }, {});
}

export async function getActiveFileUri():Promise<vscode.Uri | undefined>{
  let fileUri;
  if (vscode.window.activeTextEditor === undefined) {
    const tmpClipboard = await vscode.env.clipboard.readText();

    await vscode.commands.executeCommand('copyFilePath');
    let fileName = await vscode.env.clipboard.readText();
    await vscode.env.clipboard.writeText(tmpClipboard);

    fileName = fileName.split('\n')[0];
    fileUri = vscode.Uri.file(fileName);
  } else {
    fileUri = vscode.window.activeTextEditor.document.uri;
  }

  return fileUri;
}

export async function createDirectoryPath(path: any, fullPath: string, rootPaath: string) {
  if (path instanceof Array) {
    for (let i = 0; i < path.length; i++) {
      createDirectoryPath(path[i], fullPath, rootPaath);
    }
  } else if (path instanceof Object) {
    for (let i = 0; i < Object.keys(path).length; i++) {
      const objName = Object.keys(path)[i];

      createDirectoryPath(path[objName], fullPath + objName + "/", rootPaath);
    }
  } else {


    let makePath:string = rootPaath + fullPath + path;

    if (!existsSync(makePath)) {
      mkdirSync(makePath, { recursive: true });
    }
  }
}

export function getSubFolders(source:string):string[] {
  return readdirSync(path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, source), { withFileTypes: true })
          .filter((dirent) => {
            return dirent.isDirectory();
          })
          .map((dirent) => dirent.name);
}


export async function getWorkingFile() {
  let fileName = vscode.window.activeTextEditor?.document.fileName.split(path.sep).join(path.posix.sep)!;

  if (fileName === undefined) {
    const tmpClipboard = await vscode.env.clipboard.readText();
    await vscode.commands.executeCommand('copyFilePath');
    fileName = await vscode.env.clipboard.readText();

    const fileParts = fileName.split('\n')[0].split(path.sep);
    if (fileParts[0].includes(":")) {
      fileParts[0] = fileParts[0].toLowerCase();
    }

    fileName = fileParts.join(path.posix.sep)!;

    await vscode.env.clipboard.writeText(tmpClipboard);
  }
  return toUpperDriverLetter(fileName);
}

export function getRelativePartsFromFile(filePath:string):string[] {
  const wsRoot = getWorkspaceRootPath() + "/";
  const withoutRoot = toUpperDriverLetter(filePath).replace(wsRoot, "");
  const parts = withoutRoot.split("/");
  return parts;
}

export function getSchemaFromFile(filePath:string):string {
  const parts:string[] = getRelativePartsFromFile(filePath);

  if (parts[0] === "db") {
    return parts[1]
  }

  throw new Error("Unknown directory structur (getSchemaFromFile) first part is not 'db != '" + parts[0]);
}

export function getObjectTypePathFromFile(filePath:string):string {
  const parts:string[] = getRelativePartsFromFile(filePath);

  if (parts[0] === "db") {
    parts.shift();
    parts.shift();
    parts.pop();

    if (parts.length > 1 && parts[1] === "tables_ddl") {
      parts.pop();
    }

    return parts.join('/');
  }

  throw new Error("Unknown directory structur (getObjectTypeFromFile) first part is not 'db != '" + parts[0]);

}

export function getObjectNameFromFile(filePath:string):string {
  const parts:string[] = getRelativePartsFromFile(filePath);

  if (parts[0] === "db") {
    return path.basename(filePath);
  }
  LoggingService.logError("Unknown directory structur (getObjectNameFromFile) first part is not 'db != '" + parts[0]);
  throw new Error("Unknown directory structur (getObjectNameFromFile) first part is not 'db != '" + parts[0]);

}

export function compareVersions(versionA: string, versionB: string): number {
  const partsA = versionA.split('.').map(Number);
  const partsB = versionB.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const numA = partsA[i] || 0;
      const numB = partsB[i] || 0;

      if (numA < numB) {
          return -1;
      } else if (numA > numB) {
          return 1;
      }
  }

  return 0;
}

export const execShell = (cmd: string, statusText: string, relTargetFolder: string = "") =>
    new Promise<string>((resolve, reject) => {
      LoggingService.logInfo(statusText);
      exec(cmd, { cwd: path.join(getWorkspaceRootPath(), relTargetFolder) }, (err, out) => {

        if (err) {
          return reject(err);
        }
        return resolve(out);
      });

    });


export const isJSON = (content: string): boolean => {
    try {
      JSON.parse(content);

      return true;
    } catch (error) {
      return false;
    }
}

export const replaceKeysWithValues = (inputString: string, keyValues: KeyVal[]): string => {
  let resultString = inputString;

  keyValues.forEach(({ key, value }) => {
      resultString = resultString.replace(key, value);
  });

  return resultString;
}

export function toFlatPropertyMap(obj: object, keySeparator = '/') {
  const flattenRecursive = (obj: object, parentProperty?: string, propertyMap: Record<string, unknown> = {}) => {
    for(const [key, value] of Object.entries(obj)){
      const property = parentProperty ? `${parentProperty}${keySeparator}${key}` : key;
      if(value && typeof value === 'object'){
        flattenRecursive(value, property, propertyMap);
      } else {
        propertyMap[property] = value;
      }
    }
    return propertyMap;
  };
  return flattenRecursive(obj);
}

export function showInformationProgress(msg:string, timeoutms:number = 3000) {
  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title:  msg,
    cancellable: false
  }, (progress, token) => {

    // for(let i = 0; i <= 10; i++) {
    //   setTimeout(() => {
    //     progress.report({ increment: i*10 });
    //   }, Math.round(i * timeoutms / 10));
    // }
    const p = new Promise<void>(resolve => {
      setTimeout(() => {
        resolve();
      }, timeoutms);
    });

    return p;
  });
}