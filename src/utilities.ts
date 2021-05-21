import * as path from "path";
import * as vscode from "vscode";

export function matchRuleShort(str:string, rule:string) {
  var escapeRegex = (str:string) => str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
  return new RegExp("^" + rule.split("*").map(escapeRegex).join(".*") + "$").test(str);
}

export function getApplicationIdFromPath(sourceFile: string) {
  return sourceFile.split('static/f')[1].split('/src/')[0];
}

export function getTargetPathFromFileName(inAppID: string, sourceFile: string) {
  return sourceFile.split('static/f'+inAppID+'/src/')[1];
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
    console.log('fileName:', fileName);
    fileUri = vscode.Uri.file(fileName);

  } else {
    fileUri = vscode.window.activeTextEditor.document.uri;
  }

  return fileUri;
}