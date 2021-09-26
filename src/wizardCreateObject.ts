/* eslint-disable @typescript-eslint/naming-convention */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickItem, window, Disposable, CancellationToken, QuickInputButton, QuickInput, ExtensionContext, QuickInputButtons, Uri, workspace, commands, ShellExecution, ViewColumn, TextDocument } from 'vscode';
import { createDirectoryPath } from './utilities';
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { ShellHelper } from './ShellHelper';
import * as Handlebars from "handlebars";
import { getProjectInfos } from './AbstractBashTaskProvider';
import { outputLog } from './OutputChannel';



// read .env file & convert to array
const readEnvVars = (file:string) => {
  if (fs.existsSync(file)) {
    return fs.readFileSync(file, "utf-8").split(os.EOL);
  } else {
    return [];
  }
};

/**
 * Finds the key in .env files and returns the corresponding value
 *
 * @param {string} key Key to find
 * @returns {string|null} Value of the key
 */
const getEnvValue = (file: string, key: string): string | null => {
  // find the line that contains the key (exact match)
  const matchedLine = readEnvVars(file).find((line) => line.split("=")[0] === key);
  // split the line (delimiter is '=') and return the item at index 2
  return matchedLine !== undefined ? matchedLine.split("=")[1].replace(new RegExp('\"', 'g'), "") : null;
};

/**
 * Updates value for existing key or creates a new key=value line
 *
 * This function is a modified version of https://stackoverflow.com/a/65001580/3153583
 *
 * @param {string} key Key to update/insert
 * @param {string} value Value to update/insert
 */
const setEnvValue = (file: string, key: string, value: string) => {
  const envVars = readEnvVars(file);
  const targetLine = envVars.find((line) => line.split("=")[0] === key);
  if (targetLine !== undefined) {
    // update existing line
    const targetLineIndex = envVars.indexOf(targetLine);
    // replace the key/value with the new value
    envVars.splice(targetLineIndex, 1, `${key}=${value}`);
  } else {
    // create new key value
    envVars.push(`${key}=${value}`);
  }
  // write everything back to the file system
  fs.writeFileSync(file, envVars.join(os.EOL));
};

const setLine = (file: string, content: string) => {
  const lines = readEnvVars(file);
  const targetLine = lines.find((line) => line === content);
  if (targetLine !== undefined) {
    // update existing line
    const targetLineIndex = lines.indexOf(targetLine);
    lines.splice(targetLineIndex, 1, `${content}`);
  } else {
    // create new line
    lines.push(`${content}`);
  }
  // write everything back to the file system
  fs.writeFileSync(file, lines.join(os.EOL));
};
/**
 * A multi-step input using window.createQuickPick() and window.createInputBox().
 *
 * This first part uses the helper class `MultiStepInput` that wraps the API for the multi-step case.
 */
export async function wizardCreateObject(context: ExtensionContext) {

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
      shouldResume: shouldResume
    });

    return (input: MultiStepInput) => inputObjectName(input, state);
  }

  // async function inputConnection(input: MultiStepInput, state: Partial<State>) {
  //   state.dbConnection = await input.showInputBox({
  //     title,
  //     step: 3,
  //     totalSteps: 5,
  //     value: state.dbConnection || 'localhost:1521/xepdb1',
  //     prompt: 'Enter connection string (localhost:1521/xepdb1)',
  //     validate: validateValueIsRequiered,
  //     shouldResume: shouldResume
  //   });

  //   return (input: MultiStepInput) => inputAppPwd(input, state);
  // }

  // async function inputAppPwd(input: MultiStepInput, state: Partial<State>) {
  //   const appUserName = (state.projectType?.label==="MultiSchema")?state.projectName+"_depl":state.projectName+"_app";
  //   state.dbAppPwd = await input.showInputBox({
  //     title,
  //     step: 4,
  //     totalSteps: 5,
  //     value: state.dbAppPwd || '',
  //     prompt: `Enter password of ${appUserName} (creation of user scripts) `,
  //     validate: validateValueIsRequiered,
  //     shouldResume: shouldResume,
  //     password: true
  //   });

  //   return (input: MultiStepInput) => inputAdminName(input, state);
  // }

  // async function inputAdminName(input: MultiStepInput, state: Partial<State>) {
  //   state.dbAdminUser = await input.showInputBox({
  //     title,
  //     step: 5,
  //     totalSteps: 5,
  //     value: state.dbAdminUser || 'system',
  //     prompt: 'Enter name of an Admin-User (sys, admin, ...)',
  //     validate: validateValueNotRequiered,
  //     shouldResume: shouldResume
  //   });

  // }


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
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (let i = 0; i < files.length; i++) {
      if (files[i].isDirectory()) {
        return true;
      }
    }
    return false;
  }

  function *walkSync(dir:string):any {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (let i = 0; i < files.length; i++) {
      if (files[i].isDirectory()) {
        // check if there is any subdir in filder
        if (subDirExists(path.join(dir, files[i].name))){
          yield* walkSync(path.join(dir, files[i].name));
        } else {
          yield path.join(dir, files[i].name);
        }
      }
    }
  }

  function rtrim(str:string, chr:string) {
    var rgxtrim = (!chr) ? new RegExp('\\s+$') : new RegExp(chr+'+$');
    return str.replace(rgxtrim, '');
  }

  async function getAvailableObjectTypes(): Promise<QuickPickItem[]> {
    if (workspace.workspaceFolders){
      let projectInfos = getProjectInfos(context);
      let folders:string[] = [];


      for (let schemaPath of [ ... new Set([path.join(workspace.workspaceFolders[0].uri.fsPath + "/db", projectInfos.dataSchema),
                                            path.join(workspace.workspaceFolders[0].uri.fsPath + "/db", projectInfos.logicSchema),
                                            path.join(workspace.workspaceFolders[0].uri.fsPath + "/db", projectInfos.appSchema)])]) {

        for (let folderItem of walkSync(schemaPath)) {
          folders.push((folderItem as string).replace(workspace.workspaceFolders[0].uri.fsPath, '').replace(/\\/g, '/'));
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
    const fileF = path.join(workspace.workspaceFolders[0].uri.fsPath , state.objectType.label, state.objectName + "." + 'xxx');
    const dirname = path.dirname(fileF).split(path.sep).pop() || '';
    let extension = dirname.toLowerCase() === "packages" ? "pks" : "sql";

    // eine auf jeden Fall
    const file1 = path.join(workspace.workspaceFolders[0].uri.fsPath , state.objectType.label, rtrim(state.objectName, "." + extension) + "." + extension);
    fs.writeFileSync(file1, "");

    workspace.openTextDocument(Uri.file(file1)).then(doc => {
      window.showTextDocument(doc, {preview: false});
    });

    let file2:string|undefined = undefined;
    if (extension === "pks") {
      file2 = path.join(workspace.workspaceFolders[0].uri.fsPath , state.objectType.label, rtrim(state.objectName, ".pkb") + ".pkb");
      fs.writeFileSync(file2, "");

      extension = "(pks/pkb)";
    }

    window.showInformationMessage(`File for object '${state.objectName}.${extension}' successfully created`);

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
      const restComponents     = filePathComponents.slice(wsPathComponents.length + 2);
      restComponents.pop();
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

// -------------------------------------------------------
// Helper code that wraps the API for the multi-step case.
// -------------------------------------------------------


class InputFlowAction {
  static back = new InputFlowAction();
  static cancel = new InputFlowAction();
  static resume = new InputFlowAction();
}

type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

interface QuickPickParameters<T extends QuickPickItem> {
  title: string;
  step: number;
  totalSteps: number;
  items: T[];
  activeItem?: T;
  placeholder: string;
  buttons?: QuickInputButton[];
  shouldResume: () => Thenable<boolean>;
}

interface InputBoxParameters {
  title: string;
  step: number;
  totalSteps: number;
  value: string;
  prompt: string;
  validate: (value: string) => Promise<string | undefined>;
  buttons?: QuickInputButton[];
  shouldResume: () => Thenable<boolean>;
  password?: boolean;
}

class MultiStepInput {

  static async run<T>(start: InputStep) {
    const input = new MultiStepInput();
    return input.stepThrough(start);
  }

  private current?: QuickInput;
  private steps: InputStep[] = [];

  private async stepThrough<T>(start: InputStep) {
    let step: InputStep | void = start;
    while (step) {
      this.steps.push(step);
      if (this.current) {
        this.current.enabled = false;
        this.current.busy = true;
      }
      try {
        step = await step(this);
      } catch (err) {
        if (err === InputFlowAction.back) {
          this.steps.pop();
          step = this.steps.pop();
        } else if (err === InputFlowAction.resume) {
          step = this.steps.pop();
        } else if (err === InputFlowAction.cancel) {
          step = undefined;
        } else {
          throw err;
        }
      }
    }
    if (this.current) {
      this.current.dispose();
    }
  }

  async showQuickPick<T extends QuickPickItem, P extends QuickPickParameters<T>>({ title, step, totalSteps, items, activeItem, placeholder, buttons, shouldResume }: P) {
    const disposables: Disposable[] = [];
    try {
      return await new Promise<T | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
        const input = window.createQuickPick<T>();
        input.title = title;
        input.step = step;
        input.totalSteps = totalSteps;
        input.placeholder = placeholder;
        input.items = items;
        if (activeItem) {
          input.activeItems = [activeItem];
        }
        input.buttons = [
          ...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
          ...(buttons || [])
        ];
        disposables.push(
          input.onDidTriggerButton(item => {
            if (item === QuickInputButtons.Back) {
              reject(InputFlowAction.back);
            } else {
              resolve(<any>item);
            }
          }),
          input.onDidChangeSelection(items => resolve(items[0])),
          input.onDidHide(() => {
            (async () => {
              reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
            })()
              .catch(reject);
          })
        );
        if (this.current) {
          this.current.dispose();
        }
        this.current = input;
        this.current.show();
      });
    } finally {
      disposables.forEach(d => d.dispose());
    }
  }

  async showInputBox<P extends InputBoxParameters>({ title, step, totalSteps, value, prompt, validate, buttons, shouldResume, password }: P) {
    const disposables: Disposable[] = [];
    try {
      return await new Promise<string | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
        const input = window.createInputBox();
        input.title = title;
        input.step = step;
        input.totalSteps = totalSteps;
        input.value = value || '';
        input.prompt = prompt;
        input.password = password || false;
        input.buttons = [
          ...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
          ...(buttons || [])
        ];
        let validating = validate('');
        disposables.push(
          input.onDidTriggerButton(item => {
            if (item === QuickInputButtons.Back) {
              reject(InputFlowAction.back);
            } else {
              resolve(<any>item);
            }
          }),
          input.onDidAccept(async () => {
            const value = input.value;
            input.enabled = false;
            input.busy = true;
            if (!(await validate(value))) {
              resolve(value);
            }
            input.enabled = true;
            input.busy = false;
          }),
          input.onDidChangeValue(async text => {
            const current = validate(text);
            validating = current;
            const validationMessage = await current;
            if (current === validating) {
              input.validationMessage = validationMessage;
            }
          }),
          input.onDidHide(() => {
            (async () => {
              reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
            })()
              .catch(reject);
          })
        );
        if (this.current) {
          this.current.dispose();
        }
        this.current = input;
        this.current.show();
      });
    } finally {
      disposables.forEach(d => d.dispose());
    }
  }
}
