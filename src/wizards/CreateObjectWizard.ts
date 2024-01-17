/* eslint-disable @typescript-eslint/naming-convention */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickItem, window,ExtensionContext, Uri, workspace, commands, TextDocument } from 'vscode';
import { matchRuleShort, toFlatPropertyMap } from '../helper/utilities';
import * as path from "path";
import { outputLog } from '../helper/OutputChannel';
import { existsSync, mkdirSync, PathLike, readdirSync, writeFileSync } from 'fs';
import { MultiStepInput } from './InputFlowAction';
import { dbFolderDef } from './InitializeProjectWizard';
import { execSync } from 'child_process';



export async function createObjectWizard(context: ExtensionContext) {
  const title = 'dbFLux: Create Object';

  interface State {
    title: string;
    step: number;
    totalSteps: number;

    objectName: string;
    objectType: QuickPickItem;
  }

  async function collectInputs() {
    const state = {} as Partial<State>;

    await MultiStepInput.run(input => pickObjectType(input, state));
    return state as State;
  }


  async function inputObjectName(input: MultiStepInput, state: Partial<State>) {
    state.objectName = await input.showInputBox({
      title,
      step: 2,
      totalSteps: 2,
      value: state.objectName || '',
      prompt: 'Enter ObjectName',
      validate: validateValueIsRequiered,
      shouldResume: shouldResume
    });

  }

  async function pickObjectType(input: MultiStepInput, state: Partial<State>) {
    const objectTypes = await getAvailableObjectTypes();
    state.objectType = await input.showQuickPick({
      title,
      step: 1,
      totalSteps: 2,
      placeholder: 'Fuzzy pick an object',
      items: objectTypes,
      activeItem: objectTypes[0],
      shouldResume: shouldResume,
      canSelectMany: false
    });

    return (input: MultiStepInput) => inputObjectName(input, state);
  }


  function shouldResume() {
    // Could show a notification with the option to resume.
    return new Promise<boolean>((resolve, reject) => {
      // noop
    });
  }

  async function validateValueIsRequiered(name: string) {
    // eslint-disable-next-line eqeqeq
    return (name == undefined || name.length === 0) ? 'Value is required' : undefined;
  }

  async function validateValueNotRequiered(name: string) {
    // eslint-disable-next-line eqeqeq
    return undefined;
  }

  function rtrim(str:string, chr:string) {
    var rgxtrim = (!chr) ? new RegExp('\\s+$') : new RegExp(chr+'+$');
    return str.replace(rgxtrim, '');
  }

  const state = await collectInputs();

  if (workspace.workspaceFolders){
    const fileF = path.join(workspace.workspaceFolders[0].uri.fsPath , state.objectType.label, state.objectName);
    const dirname = path.dirname(fileF).split(path.sep).pop() || '';
    const fileE = path.extname(fileF);


    let myExt = new Map<string, string>([
      ["packages", "pks"],
      ["types", "tps"],
      ["js", "js"],
      ["css", "css"]
  ]);

    let extension = "." + (myExt.has(dirname)?myExt.get(dirname):"sql");
    const baseF = rtrim(path.basename(fileF), fileE);

    // create directory if not exists
    const targetDir = path.join(workspace.workspaceFolders[0].uri.fsPath, state.objectType.label);
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, {recursive:true});
    }

    // eine auf jeden Fall
    const file1 = path.join(workspace.workspaceFolders[0].uri.fsPath, state.objectType.label, baseF + extension);
    writeFileSync(file1, "");

    workspace.openTextDocument(Uri.file(file1)).then(doc => {
      window.showTextDocument(doc, {preview: false});
    });

    let file2:string|undefined = undefined;
    if (extension === ".pks") {
      file2 = path.join(workspace.workspaceFolders[0].uri.fsPath , state.objectType.label, baseF + ".pkb");
      writeFileSync(file2, "");

      extension = "(pks/pkb)";
    } else  if (extension === ".tps") {
      file2 = path.join(workspace.workspaceFolders[0].uri.fsPath , state.objectType.label, baseF + ".tpb");
      writeFileSync(file2, "");

      extension = "(tps/tpb)";
    }

    window.showInformationMessage(`File for object '${baseF}${extension}' successfully created`);

  }
}

export async function getAvailableObjectTypes(): Promise<QuickPickItem[]> {
  if (workspace.workspaceFolders){
    let folders:string[] = [];

    const wsRoot = workspace.workspaceFolders[0].uri.fsPath;
    const sourceDB = path.join(wsRoot, "db");
    const sourceStatic = path.join(wsRoot, "static");
    const originalPath = Object.keys(toFlatPropertyMap(dbFolderDef[0]));

    const getSchemaFolders = (source: PathLike) =>
        readdirSync(source, { withFileTypes: true })
        .filter((dirent) => {
          return dirent.isDirectory() && !["_setup", ".setup", "sys", "dist", ".hooks"].includes(dirent.name);
        })
        .map((dirent) => path.join(source.toString(), dirent.name));

    for (let schemaPath of [ ... getSchemaFolders(sourceDB)]) {
      // known structure
      for (let opath of originalPath) {
        const folderString = schemaPath + "/" + (opath as string);

        if (folderString.includes("tables/tables_ddl")) {
          folders.push(folderString.replace(wsRoot + path.sep, '').replace(/\\/g, '/').replace("tables/tables_ddl", "tables"));
        }
        folders.push(folderString.replace(wsRoot + path.sep, '').replace(/\\/g, '/'));

      }

      // real file path
      for (let folderItem of walkSync(schemaPath)) {
        const folderString = (folderItem as string);
        if (folderString.includes("tables" + path.sep + "tables_ddl")) {
          folders.push(folderString.replace(wsRoot + path.sep, '').replace(/\\/g, '/').replace("tables/tables_ddl", "tables"));
        }
        folders.push(folderString.replace(wsRoot + path.sep, '').replace(/\\/g, '/'));
      }
    }

    for (let schemaPath of [ ... getSchemaFolders(sourceStatic)]) {
      for (let folderItem of walkSync(schemaPath)) {
        folders.push((folderItem as string).replace(wsRoot + path.sep, '').replace(/\\/g, '/'));
      }
    }

    folders.push(".hooks/pre");
    folders.push(".hooks/post");
    folders.push("db/.hooks/pre");
    folders.push("db/.hooks/post");

    const uniqueFolders = [...new Set(folders)];
    const folderNames = uniqueFolders.map(function(element){return {"label":element, "description": path.parse(element).name, "alwaysShow": false};});

    return folderNames;
  }

  return [{label: ""}];
}

export function callSnippet(wsPath:string, document:TextDocument, prefix:string|undefined = undefined) {

  // do we have a document
  if ( document && document.uri && document.uri.scheme === 'file' ) {

    // is document new / empty
    if ( document.getText().length === 0 ) {
      const file        = document.fileName;

      const wsPathComponents   = path.normalize(wsPath).split(path.sep);
      const filePathComponents = path.normalize(file).split(path.sep);

      let restComponents     = filePathComponents.slice(wsPathComponents.length + 2);
      restComponents.pop();

      // insice static is another deep level
      if (matchRuleShort(file.replace(/\\/g, '/'), '*/static/*/src/*')) {
        restComponents = restComponents.slice(restComponents.length -2 );
      }

      const snippetName = (prefix?prefix+'-':'') + restComponents.join('-') + path.parse(file).ext;

      outputLog(`snippetName to look for: ${snippetName}`);

      commands.executeCommand('editor.action.selectAll').then( function () {
        commands.executeCommand('editor.action.insertSnippet',
          { name: snippetName }).then( function () {

            const editor = window.activeTextEditor;

            // nothing happend? Ok, maybe we have a snippet
            if (editor && editor.document) {
              if (editor.document.getText() !== "") {
                if (prefix === undefined) {
                  window.showInformationMessage(`Your snippet ${snippetName} was applied.`);
                } else {
                  window.showInformationMessage(`dbFlux snippet ${snippetName} was applied. See help if you want to remove it by your own.`);
                }
              } else {
                if (prefix === undefined) {
                  callSnippet(wsPath, document, 'dbflux');
                }
              }
            }
          });
      });

    }
  }


}

export async function createTableDDL(context: ExtensionContext) {

  interface State {
    title: string;
    step: number;
    totalSteps: number;

    objectName: string;
    objectType: QuickPickItem;
  }

  async function collectInputs() {
    const state = {} as Partial<State>;

    await MultiStepInput.run(input => pickObjectType(input, state));
    return state as State;
  }

  const title = 'dbFLux: Create TableDDL File';

  async function getQuickPickFromCurrentFile(quickPicks:QuickPickItem[]):Promise<QuickPickItem> {
    let item:QuickPickItem = quickPicks[0];
    if (window.activeTextEditor != undefined) {
      const relativeFile = workspace.asRelativePath(window.activeTextEditor.document.uri);
      const pathBlocks = relativeFile.split(path.posix.sep);
      if (pathBlocks[pathBlocks.length-2] === 'tables') {
        const tempItem = quickPicks.find(quickPick => (relativeFile.includes(quickPick.label)))
        item = tempItem?tempItem:item;
      }
    }

    return item;
 }

  async function pickObjectType(input: MultiStepInput, state: Partial<State>) {
    const objectTypes = await getAllTableFiles();
    const currentFQickPick = await getQuickPickFromCurrentFile(objectTypes);

    state.objectType = await input.showQuickPick({
      title,
      step: 1,
      totalSteps: 1,
      placeholder: 'Fuzzy pick a table',
      items: objectTypes,
      activeItem: currentFQickPick,
      shouldResume: shouldResume,
      canSelectMany: false
    });
  }


  function shouldResume() {
    // Could show a notification with the option to resume.
    return new Promise<boolean>((resolve, reject) => {
      // noop
    });
  }

  async function validateValueIsRequiered(name: string) {
    // eslint-disable-next-line eqeqeq
    return (name == undefined || name.length === 0) ? 'Value is required' : undefined;
  }

  async function validateValueNotRequiered(name: string) {
    // eslint-disable-next-line eqeqeq
    return undefined;
  }





  async function getAllTableFiles(): Promise<QuickPickItem[]> {
    if (workspace.workspaceFolders){
      let folders:string[] = [];

      const wsRoot = workspace.workspaceFolders[0].uri.fsPath;
      const sourceDB = path.join(wsRoot, "db");

      const getSchemaFolders = (source: PathLike) =>
          readdirSync(source, { withFileTypes: true })
          .filter((dirent) => {
            return dirent.isDirectory() && !["_setup", ".setup", "dist", ".hooks"].includes(dirent.name);
          })
          .map((dirent) => path.join(source.toString(), dirent.name));

      for (let schemaPath of [ ... getSchemaFolders(sourceDB)]) {
        // real file path
        const folderPath = path.join(schemaPath, 'tables');
        if (existsSync(folderPath)) {
          const files = readdirSync(folderPath, { withFileTypes: true }).filter((dirent) => !dirent.isDirectory());

          for (let folderItem of files) {
            folders.push(path.join(folderPath, folderItem.name).replace(sourceDB + path.sep, '').replace(/\\/g, '/'));
          }
        }
      }


      const uniqueFolders = [...new Set(folders)];
      const folderNames = uniqueFolders.map(function(element){return {"label":element, "description": path.parse(element).name, "alwaysShow": false};});

      return folderNames;
    }

    return [{label: ""}];
  }


  //
  const state = await collectInputs();

  if (state.objectType.label && workspace.workspaceFolders) {
    // find max num used
    const folderParts = state.objectType.label.replace("/tables/", "/tables/tables_ddl/").split("/");
    folderParts.pop();
    const regex = /\d+/g;
    let nextNum = 0;


    const tableDDLFolder = path.join(workspace.workspaceFolders[0].uri.fsPath, "db", folderParts.join("/"));

    // document.write(matches);
    if (existsSync(tableDDLFolder)) {
      const files = readdirSync(tableDDLFolder, { withFileTypes: true }).filter((dirent) => {
        return !dirent.isDirectory() && dirent.name.includes(state.objectType.description!+".");
      });

      for (let folderItem of files) {
        if (folderItem.name.match(regex)) {
          const num = parseInt(folderItem.name.match(regex)?.toString()!);
          if (num > nextNum) {
            nextNum = num;
          }
        }
      }
    } else {
      mkdirSync(tableDDLFolder);
    }

    const newDDLFileName = path.join(tableDDLFolder, state.objectType.description! + "." + (nextNum + 1) + ".sql");

    const ws:string = workspace.workspaceFolders[0].uri.fsPath;
    let output = ["-- " + newDDLFileName];

    // if git folder exists then try to get git diff
    if (existsSync(path.join(ws, ".git"))) {
      const gitCommand = 'git diff --unified=0 ' + path.join("db", state.objectType.label); // + " | grep -Po '(?<=^\+)(?!\+\+).*'";
      output = execSync(gitCommand, { cwd:ws }).toString().split("\n").filter((line) => {
        return line.match(/(?<=^[\+-])(?![(\+\+)(--)]).*/)
      });
      writeFileSync(newDDLFileName, "/** \n  modified lines in " + state.objectType.description + ".sql\n" + "    " + output.join('\n    ') + "\n**/");
    } else {
      writeFileSync(newDDLFileName, "/** \n  alter table " + state.objectType.description  + "\n**/");
    }


    window.showInformationMessage(`File '${newDDLFileName}' successfully created`);

    workspace.openTextDocument(Uri.file(newDDLFileName)).then(doc => {
      window.showTextDocument(doc, {preview: false});
    });
  }
}

function *walkSync(dir:string):any {
  const files = readdirSync(dir, { withFileTypes: true });
  for (let i = 0; i < files.length; i++) {
    if (files[i].isDirectory() && files[i].name !== "dist") {
      // check if there is any subdir in filder
      if (subDirExists(path.join(dir, files[i].name))){
        yield* walkSync(path.join(dir, files[i].name));
      } else {
        yield path.join(dir, files[i].name);
      }
    }
  }
}



function subDirExists(dir: string):boolean {
  const files = readdirSync(dir, { withFileTypes: true });
  for (let i = 0; i < files.length; i++) {
    if (files[i].isDirectory()) {
      return true;
    }
  }
  return false;
}