/* eslint-disable @typescript-eslint/naming-convention */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync, readFileSync, writeFileSync } from 'fs';
import * as path from "path";
import { QuickPickItem, workspace } from 'vscode';
import { MultiStepInput } from './InputFlowAction';



const COLUMN_SNIPPET_SCOPE = "dbflux.column_context";

export async function chooseSnippetWizard() {
  const title = 'dbFLux: Create ObjectType Snippet';

  interface State {
    title:               string;
    step:                number;
    totalSteps:          number;

    pickedSnipped:          QuickPickItem;

    content:             string | undefined;
  }

  async function collectInputs() {
    const state = {} as Partial<State>;



    await MultiStepInput.run(input => pickObjectType(input, state));
    return state as State;
  }




  async function pickObjectType(input: MultiStepInput, state: Partial<State>) {
    const objectTypes = await getAvailableSnippetKeys();
    if (objectTypes.length>0) {
      state.pickedSnipped = await input.showQuickPick({
        title,
        step: 1,
        totalSteps: 2,
        placeholder: 'Pick an object type',
        items: objectTypes.map((element) => ({"label": element})),
        shouldResume: shouldResume,
        canSelectMany: false,
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



  return await collectInputs();

}

export async function getAvailableSnippetKeys() {
  // ObjectRepresentation of dbFlux - snippets
  const targetSnippetContent: any = await getSnippetContent();

  const result: any = await getScoppedContent(targetSnippetContent, COLUMN_SNIPPET_SCOPE);

  return Object.keys(result);
}

async function getScoppedContent(targetSnippetContent: any, scopeWith:string) {
  const result: any = {};

  for (const key in targetSnippetContent) {
    if (targetSnippetContent.hasOwnProperty(key) && typeof targetSnippetContent[key] === 'object' && targetSnippetContent[key]?.scope === scopeWith) {
      result[key] = targetSnippetContent[key];
    }
  }
  return result;
}

async function getSnippetContent() {
  let targetSnippetContent: any = {};

  if (workspace.workspaceFolders) {
    const snippetFile = path.join(workspace.workspaceFolders[0].uri.fsPath, ".vscode", "dbflux.code-snippets");


    if (existsSync(snippetFile)) {
      targetSnippetContent = JSON.parse(readFileSync(snippetFile).toString());
    } else {
      writeFileSync(snippetFile, "{}");
    }
  }
  return targetSnippetContent;
}

export async function getSnippedBody(snippetKey:string):Promise<string[]> {
  const targetSnippetContent: any = await getSnippetContent();

  console.log('snippetKey', targetSnippetContent, snippetKey);
  return targetSnippetContent[snippetKey]?.body;

}