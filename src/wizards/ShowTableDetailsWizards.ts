/* eslint-disable @typescript-eslint/naming-convention */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync, readFileSync } from 'fs';
import * as path from "path";
import { ExtensionContext, QuickPickItem, window, workspace } from 'vscode';
import { toFlatPropertyMap } from '../helper/utilities';
import { getAllTableFiles, getQuickPickFromCurrentFile, getQuickPickFromCurrentSelection } from './CreateObjectWizard';
import { dbFolderDef } from './InitializeProjectWizard';
import { MultiStepInput } from './InputFlowAction';
import { DBFluxTableDetails } from '../ui/DBFluxTableDetails';




export async function showTableDetailsWizard(context: ExtensionContext, tree: DBFluxTableDetails, guessContext: boolean) {
  const title = 'dbFLux: Show Table Details';

  interface State {
    title:               string;
    step:                number;
    totalSteps:          number;

    schemaName: QuickPickItem;
    objectTypeExtension: QuickPickItem;
    objectType:          QuickPickItem;

    content:             string | undefined;
  }

  async function collectInputs() {
    const state = {} as Partial<State>;

    // default extension
    state.objectTypeExtension = {"label":"sql"};

    await MultiStepInput.run(input => pickTableFile(input, state));
    return state as State;
  }


  async function pickTableFile(input: MultiStepInput, state: Partial<State>) {
    const objectTypes = await getAllTableFiles();
    const quickPickFromSelection: QuickPickItem|undefined = await getQuickPickFromCurrentSelection(objectTypes);
    const quickPickFromCurrentFile: QuickPickItem|undefined = await getQuickPickFromCurrentFile(objectTypes);

    if (guessContext && (quickPickFromSelection || quickPickFromCurrentFile )) {
      state.objectType = {label: (quickPickFromSelection || quickPickFromCurrentFile)!.label};
    } else {
      state.objectType = await input.showQuickPick({
        title,
        step: 1,
        totalSteps: 2,
        placeholder: 'Pick an object type',
        items: objectTypes,
        activeItem: (quickPickFromSelection || quickPickFromCurrentFile),
        shouldResume: shouldResume,
        canSelectMany: false,
        value: (quickPickFromSelection || quickPickFromCurrentFile)
      });
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
  console.log('state', state);


  tree.addTable(state.objectType.label);
}


export async function getAvailableTableFiles(): Promise<QuickPickItem[]> {
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