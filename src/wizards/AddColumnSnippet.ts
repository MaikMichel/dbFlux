import { ExtensionContext, Selection, Uri, window, workspace } from "vscode";
import { MultiStepInput } from "./InputFlowAction";
import * as path from "path";
import { existsSync, readFileSync, writeFileSync } from 'fs';

interface State {
  title:               string;
  step:                number;
  totalSteps:          number;

  snippetName: string;
}

async function addColumnSnippetWizard() {
  const title = 'dbFlux: Create ObjectType Snippet';



  async function collectInputs() {
    const state = {} as Partial<State>;


    await MultiStepInput.run(input => inputProjectName(input, state));
    return state as State;
  }

  async function inputProjectName(input: MultiStepInput, state: Partial<State>) {
    state.snippetName = await input.showInputBox({
      title,
      step: 1,
      totalSteps: 5,
      value: state.snippetName || '',
      prompt: 'Choose a Name for your Snippet',
      validate: validateRequiredValueOnlyNumbersAlphaUScore,
      shouldResume: shouldResume
    });
  }

  async function validateRequiredValueOnlyNumbersAlphaUScore(name: string) {
    return (name == undefined || name.length === 0) ? 'Value is required' : (!name.toLowerCase().match(/^[0-9a-z_ ]+$/)) ? 'Value not a valid snippet name' : undefined;
  }

  function shouldResume() {
    // Could show a notification with the option to resume.
    return new Promise<boolean>((resolve, reject) => {
      // noop
    });
  }

  return await collectInputs();
}

export async function addColumnSnippet(context: ExtensionContext) {
  const state = await addColumnSnippetWizard();

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

    // define the key
    const snippetKey = state.snippetName;

    // get selected content or shipped dbflux default snippet
    const content = (await getSnippText()).text;


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
      "scope": "dbflux.column_context",
      "body" : content?.replaceAll("\r\n", "\n").split("\n"),
      "description": "dbFlux will replace the placeholders (§DBFLUX_COLUMN, §{DBFLUX_COLUMN}, §dbflux_column, §{dbflux_column}, "+
                                                           "§DBFLUX_TABLE, §{DBFLUX_TABLE}, §dbflux_table, §{dbflux_table}). YOU HAVE TO USE: '§'!"
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

async function getSnippText() {
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
      if (targetSnippetContent["dbflux-column-output"] != undefined) {
        const snippet = targetSnippetContent["dbflux-column-output"];
        text = snippet.body.join("\n");
      }
    }
  }



  return { text, type: editor?.document.languageId };
}