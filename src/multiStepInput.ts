/* eslint-disable @typescript-eslint/naming-convention */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickItem, window, Disposable, CancellationToken, QuickInputButton, QuickInput, ExtensionContext, QuickInputButtons, Uri, workspace, commands, ShellExecution, ViewColumn } from 'vscode';
import { createDirectoryPath } from './utilities';
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { ShellHelper } from './ShellHelper';
import * as Handlebars from "handlebars";



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
export async function multiStepInput(context: ExtensionContext) {

	interface State {
		title: string;
		step: number;
		totalSteps: number;

		projectName: string;
		projectType: QuickPickItem;
		dbConnection: string;
		dbAdminUser: string;
		dbAppPwd: string;
	}

	async function collectInputs() {
		const state = {} as Partial<State>;
		if (workspace.workspaceFolders) {

			state.projectName = context.workspaceState.get("dbFlux_PROJECT") || "";
			state.dbConnection = context.workspaceState.get("dbFlux_DB_TNS") || "";
			state.dbAdminUser = context.workspaceState.get("dbFlux_DB_ADMIN_USER") || "";
		}

		await MultiStepInput.run(input => inputProjectName(input, state));
		return state as State;
	}

	const title = 'Initialize Project';

	async function inputProjectName(input: MultiStepInput, state: Partial<State>) {
		state.projectName = await input.showInputBox({
			title,
			step: 1,
			totalSteps: 5,
			value: state.projectName || '',
			prompt: 'Choose a Name for your project',
			validate: validateValueIsRequiered,
			shouldResume: shouldResume
		});
		return (input: MultiStepInput) => pickProjectType(input, state);
	}

	async function pickProjectType(input: MultiStepInput, state: Partial<State>) {
		const projectTypes = await getAvailableProjectTypes();
		state.projectType = await input.showQuickPick({
			title,
			step: 2,
			totalSteps: 5,
			placeholder: 'Pick a type',
			items: projectTypes,
			activeItem: state.projectType || projectTypes[0],
			shouldResume: shouldResume
		});

		return (input: MultiStepInput) => inputConnection(input, state);
	}

	async function inputConnection(input: MultiStepInput, state: Partial<State>) {
		state.dbConnection = await input.showInputBox({
			title,
			step: 3,
			totalSteps: 5,
			value: state.dbConnection || 'localhost:1521/xepdb1',
			prompt: 'Enter connection string (localhost:1521/xepdb1)',
			validate: validateValueIsRequiered,
			shouldResume: shouldResume
		});

		return (input: MultiStepInput) => inputAppPwd(input, state);
	}

	async function inputAppPwd(input: MultiStepInput, state: Partial<State>) {
		const appUserName = (state.projectType?.label==="MultiSchema")?state.projectName+"_depl":state.projectName+"_app";
		state.dbAppPwd = await input.showInputBox({
			title,
			step: 4,
			totalSteps: 5,
			value: state.dbAppPwd || '',
			prompt: `Enter password of ${appUserName} (creation of user scripts) `,
			validate: validateValueIsRequiered,
			shouldResume: shouldResume,
			password: true
		});

		return (input: MultiStepInput) => inputAdminName(input, state);
	}

	async function inputAdminName(input: MultiStepInput, state: Partial<State>) {
		state.dbAdminUser = await input.showInputBox({
			title,
			step: 5,
			totalSteps: 5,
			value: state.dbAdminUser || 'system',
			prompt: 'Enter name of an Admin-User (sys, admin, ...)',
			validate: validateValueNotRequiered,
			shouldResume: shouldResume
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


	async function getAvailableProjectTypes(): Promise<QuickPickItem[]> {
		return [
			{label: "MultiSchema",
		   description: "3 Schemas are supported data, logic, app. All prefixed with projectname. Connection is started with a proxy user depl"},
			{label: "SingleSchema",
			description: "There will be only one Schema named app and prefix with project name. Connection is startet with Schema-Owner"}
		];
	}

	const state = await collectInputs();


	function createFolders(state: State) {
		if (workspace.workspaceFolders) {

			const schemaDef:any = [{
				"constrainst": {
					"checks": "",
					"foreigns": "",
					"primaries": "",
					"uniques": ""
				},
				"contexts": "",
				"ddl": {
					"init": "",
					"post": "",
					"pre": "",
					"base": ""
				},
				"dml": {
					"init": "",
					"post": "",
					"pre": "",
					"base": ""
				},
				"indexs": {
					"defaults": "",
					"primaries": "",
					"uniques": ""
				},
				"jobs": "",
				"policies": "",
				"sequences": "",
				"sources": {
					"functions": "",
					"packages": "",
					"procedures": "",
					"triggers": "",
					"types": "",
					"views": ""
				},
				"tables": "",
				// eslint-disable-next-line @typescript-eslint/naming-convention
				"tables_ddl": "",
				"tests": {
					"packages": ""
				}
			}];

			const dataSchema = state.projectName + "_data";
			const logicSchema = state.projectName + "_logic";
			const appSchema = state.projectName + "_app";

			const folderDef:any = {
				"apex" : "",
				"db" : {
					["_setup"]: {
						users: ""
					},
					[dataSchema] : schemaDef,
					[logicSchema] : schemaDef,
					[appSchema] : schemaDef,
					},
				"rest": "",
				"static": ""
			};

			if (state.projectType.label !== "MultiSchema") {
				delete folderDef.db[dataSchema];
				delete folderDef.db[logicSchema];
			}

			createDirectoryPath(folderDef, "/", workspace.workspaceFolders[0].uri.fsPath) ;
		}
	}

	createFolders(state);

	const fcontent = {
		"title" : "dbFlux - Initialization summary",
		"files" : [],
		"userFile": ""
	};

	async function writeUserScritps(state: State) {
		if (workspace.workspaceFolders) {

			const gitIgnore = path.resolve(workspace.workspaceFolders![0].uri.fsPath, ".gitignore");
			if (state.projectType.label === "MultiSchema") {
				let schemas = [`${state.projectName}_data`, `${state.projectName}_logic`, `${state.projectName}_app`];

				schemas.forEach((schema, index) => {
					const relativeFile = `db/_setup/users/0${index + 1}_create_${schema}.sql`;
					const schemaUser = path.resolve(workspace.workspaceFolders![0].uri.fsPath, relativeFile);
					const template = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, "..", "dist", "user_default.tmpl.sql").split(path.sep).join(path.posix.sep), "utf8"));
					const content = {
						"data_schema": schema
					};

					fs.writeFileSync(schemaUser, template(content));
					(fcontent.files as string[]).push(relativeFile);
				});

				if (state.projectType.label === "MultiSchema") {
					const relativeFile = `db/_setup/users/04_create_${state.projectName}_depl.sql`;
					const proxyUser = path.resolve(workspace.workspaceFolders![0].uri.fsPath, relativeFile);
					const template = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, "..", "dist", "user_proxy.tmpl.sql").split(path.sep).join(path.posix.sep), "utf8"));
					const content = {
						"proxy_user": `${state.projectName}_depl`,
						"data_schema": `${state.projectName}_data`,
						"logic_schema": `${state.projectName}_logic`,
						"app_schema": `${state.projectName}_app`,
						"db_app_pwd": state.dbAppPwd
					};
					(fcontent.files as string[]).push(relativeFile);
					fs.writeFileSync(proxyUser, template(content));
					setLine(gitIgnore, relativeFile);
				}
			} else {
				const relativeFile = `db/_setup/users/01_create_${state.projectName}_app.sql`;
				const schemaUser = path.resolve(workspace.workspaceFolders![0].uri.fsPath, relativeFile);
				const template = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, "..", "dist", "user_single_app.tmpl.sql").split(path.sep).join(path.posix.sep), "utf8"));
				const content = {
					"data_schema": `${state.projectName}_app`,
					"db_app_pwd": state.dbAppPwd
				};

				fs.writeFileSync(schemaUser, template(content));
				(fcontent.files as string[]).push(relativeFile);
				setLine(gitIgnore, relativeFile);
			}

		}
	}

	function getWebviewContent(content:any) {
    const template = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, "..", "dist", "welcome.tmpl.html").split(path.sep).join('/'), "utf8"));
    return template(content);
  }

	function openWebView() {
		const panel = window.createWebviewPanel(
                        'openWebview', // Identifies the type of the webview. Used internally
                        fcontent.title, // Title of the panel displayed to the user
                        ViewColumn.One, // Editor column to show the new webview panel in.
                        { // Enable scripts in the webview
                          enableScripts: true, //Set this to true if you want to enable Javascript.
                          enableCommandUris: true
                        },

                  );



    // Get path to resource on disk
    const onDiskPath = Uri.file(
      path.join(context.extensionPath, 'css', 'style.css')
    );

    panel.webview.onDidReceiveMessage(async message => {
      if (message.command === "open") {
        if (workspace.workspaceFolders) {
          const filePath = path.join(workspace.workspaceFolders[0].uri.fsPath, Uri.parse(message.link).path);

          const uri = Uri.file(filePath);
          await window.showTextDocument(uri);
        }
      }
  });

    // And get the special URI to use with the webview
    const cssURI = panel.webview.asWebviewUri(onDiskPath);
		fcontent.userFile = fcontent.files[fcontent.files.length-1];
    panel.webview.html = getWebviewContent(fcontent);
	}

	async function writeConfigFiles(state: State) {
		if (workspace.workspaceFolders) {
			const applyFilePath = path.resolve(workspace.workspaceFolders[0].uri.fsPath, "apply.env");
			const buildFilePath = path.resolve(workspace.workspaceFolders[0].uri.fsPath, "build.env");
			const gitignore = path.resolve(workspace.workspaceFolders[0].uri.fsPath, ".gitignore");

			context.workspaceState.update("dbFlux_mode", "dbFlux");
				context.workspaceState.update("dbFlux_DB_TNS", state.dbConnection);
			if (state.projectType.label === "MultiSchema") {
					context.workspaceState.update("dbFlux_DB_APP_USER", state.projectName.toLowerCase() + "_depl");
			} else {
					context.workspaceState.update("dbFlux_DB_APP_USER", state.projectName.toLowerCase() + "_app");
			}

				context.workspaceState.update("dbFlux_DB_APP_PWD", state.dbAppPwd);

				context.workspaceState.update("dbFlux_DB_ADMIN_USER", state.dbAdminUser);

				context.workspaceState.update("dbFlux_PROJECT", state.projectName.toLowerCase());
			if (state.projectType.label === "MultiSchema") {
					context.workspaceState.update("dbFlux_DATA_SCHEMA", state.projectName.toLowerCase() + "_data");
					context.workspaceState.update("dbFlux_LOGIC_SCHEMA", state.projectName.toLowerCase() + "_logic");
					context.workspaceState.update("dbFlux_APP_SCHEMA", state.projectName.toLowerCase() + "_app");
			} else {
					context.workspaceState.update("dbFlux_DATA_SCHEMA", state.projectName.toLowerCase() + "_app");
					context.workspaceState.update("dbFlux_LOGIC_SCHEMA", state.projectName.toLowerCase() + "_app");
					context.workspaceState.update("dbFlux_APP_SCHEMA", state.projectName.toLowerCase() + "_app");
			}

				context.workspaceState.update("dbFlux_WORKSPACE", state.projectName.toLowerCase());

		}

	}

	writeConfigFiles(state);
	writeUserScritps(state);
	openWebView();
	commands.executeCommand("dbFlux.reloadExtension");


	window.showInformationMessage(`Application structure for '${state.projectName}' successfully created`);
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
