/* eslint-disable @typescript-eslint/naming-convention */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync, readFileSync, writeFileSync } from 'fs';
import * as path from "path";
import { ExtensionContext, QuickPickItem, Selection, Uri, window, workspace } from 'vscode';
import { dbFolderDef } from './InitializeProjectWizard';
import { MultiStepInput } from './InputFlowAction';
import { toFlatPropertyMap } from '../helper/utilities';



export async function createObjectTypeSnippetWizard(context: ExtensionContext) {
  const title = 'dbFLux: Create ObjectType Snippet';

  interface State {
    title:               string;
    step:                number;
    totalSteps:          number;

    objectTypeExtension: QuickPickItem;
    objectType:          QuickPickItem;

    content:             string | undefined;
  }

  async function collectInputs() {
    const state = {} as Partial<State>;

    // default extension
    state.objectTypeExtension = {"label":"sql"};

    await MultiStepInput.run(input => pickObjectType(input, state));
    return state as State;
  }


  async function inputObjectTypeExtension(input: MultiStepInput, state: Partial<State>) {
    const availableExtensions = await getAvailableObjectTypeExtensions(state.objectType?.label!);
    state.objectTypeExtension = await input.showQuickPick({
      title,
      step: 1,
      totalSteps: 2,
      placeholder: 'Choose a File-Extension',
      items: availableExtensions,
      activeItem: availableExtensions[0],
      shouldResume: shouldResume,
      canSelectMany: false
    });

  }

  async function pickObjectType(input: MultiStepInput, state: Partial<State>) {
    const objectTypes = await getAvailableObjectTypes();
    state.objectType = await input.showQuickPick({
      title,
      step: 1,
      totalSteps: 2,
      placeholder: 'Pick an object type',
      items: objectTypes,
      activeItem: objectTypes[0],
      shouldResume: shouldResume,
      canSelectMany: false,
    });

    if (state.objectType?.label === "sources-packages" || state.objectType?.label === "sources-types") {
      return (input: MultiStepInput) => inputObjectTypeExtension(input, state);
    }
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

  const state = await collectInputs();


  if (workspace.workspaceFolders){
    // target snippet to write to
    const snippetFile = path.join(workspace.workspaceFolders[0].uri.fsPath, ".vscode", "dbflux.code-snippets");

    // ObjectRepresentation of dbFlux - snippets
    let targetSnippetContent:any = {};
    if (existsSync(snippetFile)) {
      targetSnippetContent = JSON.parse(readFileSync(snippetFile).toString());
    } else {
      writeFileSync(snippetFile, "{}");
    }

    // define key as object-type-folder and extension (source-packages.pks)
    const snippetKey = state.objectType.label + "." + state.objectTypeExtension?.label;

    // get selected content or shipped dbflux default snippet
    const content = await getSnippText(snippetKey);
    state.content = content?.text;

    // check to overwrite existing snippet
    if (targetSnippetContent[snippetKey] != undefined) {
      await window.showWarningMessage(`Existing ObjectType: "${snippetKey}" found, process to overwrite?`, "Process", "No")
      .then(answer => {
        if (answer === "No") {
          // Run function
          return;
        }
      })
    }

    // include snippet in file
    targetSnippetContent[snippetKey] = {
      "body" : state.content?.replaceAll("\r\n", "\n").split("\n")
    }
    writeFileSync(snippetFile, JSON.stringify(targetSnippetContent, null, 2));

    // open snippet file
    workspace.openTextDocument(Uri.file(snippetFile)).then(doc => {
      window.showTextDocument(doc, {preview: false}).then(editor => {
        // select snippetKey and put it to view
        const fullText = editor.document.getText();
        const indx = fullText.indexOf(snippetKey);

        const startPos = editor.document.positionAt(indx!);
        const endPos = editor.document.positionAt(indx! + snippetKey.length);

        editor.selection = new Selection(startPos, endPos);
        editor.revealRange(editor.selection);
      })
    });

    // just confirm finished
    await window.showInformationMessage(`ObjectType "${snippetKey}" Snippet added to snippet file: .vscode/dbflux.code-snippets`)
  }

}


export async function getAvailableObjectTypes(): Promise<QuickPickItem[]> {
  if (workspace.workspaceFolders){
    const folders = Object.keys(toFlatPropertyMap(dbFolderDef[0], "-"));
    folders.push("tables");

    const folderNames = folders.sort().map(function(element){return {"label":element, "description": path.parse(element).name, "alwaysShow": false};});

    return folderNames;
  }

  return [{label: ""}];
}

export async function getAvailableObjectTypeExtensions(objectTypePath:string): Promise<QuickPickItem[]> {
  if (workspace.workspaceFolders){
    const objectTypeExtensions:QuickPickItem[] = [];

    if (objectTypePath === "sources-packages") {
      objectTypeExtensions.push({"label":"pks", "description":"Package Specification"});
      objectTypeExtensions.push({"label":"pkb", "description":"Package Body"});
      objectTypeExtensions.push({"label":"sql", "description":"Simple SQL File"});
    } else if (objectTypePath === "sources-types") {
      objectTypeExtensions.push({"label":"tks", "description":"Type Specification"});
      objectTypeExtensions.push({"label":"tkb", "description":"Type Body"});
      objectTypeExtensions.push({"label":"sql", "description":"Simple SQL File"});
    } else {
      objectTypeExtensions.push({"label":"sql", "description":"Simple SQL File"});
    }

    return objectTypeExtensions;
  }

  return [{label: ""}];
}


async function getSnippText(snippetKey:string) {
  const editor = window.activeTextEditor;
  let text = editor?.document.getText(editor.selection);

  if (text?.length === 0) {
    // read snippet file from extension itself
    const extentionSnippetFile = path.resolve(__dirname, "..", "..", "snippets", "snippets.json").split(path.sep).join(path.posix.sep);

    let targetSnippetContent:any = {};
    if (existsSync(extentionSnippetFile)) {
      // parse it
      targetSnippetContent = JSON.parse(readFileSync(extentionSnippetFile).toString());

      // try to find then key
      if (targetSnippetContent["dbflux-" + snippetKey] != undefined) {
        const snippet = targetSnippetContent["dbflux-" + snippetKey];
        text = snippet.body.join("\n");
      }
    }
  }



  return { text, type: editor?.document.languageId };
}