/* eslint-disable @typescript-eslint/naming-convention */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickItem, window,ExtensionContext, Uri, workspace, commands, TextDocument } from 'vscode';
import { matchRuleShort } from '../helper/utilities';
import * as path from "path";
import { outputLog } from '../helper/OutputChannel';
import { existsSync, mkdirSync, PathLike, readdirSync, writeFileSync } from 'fs';
import { MultiStepInput } from './InputFlowAction';
import { dbFolderDef } from './InitializeProjectWizard';




export async function createObjectWizard(context: ExtensionContext) {

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

  const title = 'Create Object';

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
      placeholder: 'Pick a type',
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

  function subDirExists(dir: string):boolean {
    const files = readdirSync(dir, { withFileTypes: true });
    for (let i = 0; i < files.length; i++) {
      if (files[i].isDirectory()) {
        return true;
      }
    }
    return false;
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

  function toFlatPropertyMap(obj: object, keySeparator = '/') {
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

  function rtrim(str:string, chr:string) {
    var rgxtrim = (!chr) ? new RegExp('\\s+$') : new RegExp(chr+'+$');
    return str.replace(rgxtrim, '');
  }


  async function getAvailableObjectTypes(): Promise<QuickPickItem[]> {
    if (workspace.workspaceFolders){
      let folders:string[] = [];

      const wsRoot = workspace.workspaceFolders[0].uri.fsPath;
      const sourceDB = path.join(wsRoot, "db");
      const sourceStatic = path.join(wsRoot, "static");
      const originalPath = Object.keys(toFlatPropertyMap(dbFolderDef[0]));

      const getSchemaFolders = (source: PathLike) =>
          readdirSync(source, { withFileTypes: true })
          .filter((dirent) => {
            return dirent.isDirectory() && !["_setup", ".setup", "dist", ".hooks"].includes(dirent.name);
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


      const uniqueFolders = [...new Set(folders)];
      const folderNames = uniqueFolders.map(function(element){return {"label":element, "description": path.parse(element).name, "alwaysShow": false};});

      return folderNames;
    }

    return [{label: ""}];
  }


  //
  const state = await collectInputs();

  if (workspace.workspaceFolders){
    const fileF = path.join(workspace.workspaceFolders[0].uri.fsPath , state.objectType.label, state.objectName);
    const dirname = path.dirname(fileF).split(path.sep).pop() || '';
    const fileE = path.extname(fileF);


    let myExt = new Map<string, string>([
      ["packages", "pks"],
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
    }

    window.showInformationMessage(`File for object '${baseF}${extension}' successfully created`);

  }



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
