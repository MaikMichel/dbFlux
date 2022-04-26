/* eslint-disable @typescript-eslint/naming-convention */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickItem, window, ExtensionContext, Uri, workspace, commands, ViewColumn } from 'vscode';
import { createDirectoryPath, getWorkspaceRootPath } from '../helper/utilities';
import * as path from "path";

import * as fs from "fs-extra";
import * as os from "os";
import * as Handlebars from "handlebars";
import { getDBFlowMode, IProjectInfos } from '../provider/AbstractBashTaskProvider';
import { existsSync, mkdirSync, readdirSync, renameSync } from 'fs';
import { CompileTaskStore } from '../stores/CompileTaskStore';
import { MultiStepInput } from './InputFlowAction';



// read .env file & convert to array
const readEnvVars = (file:string) => {
	if (fs.existsSync(file)) {
		return fs.readFileSync(file, "utf-8").split(/\r?\n/);
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

export const dbFolderDef = [{
	".hooks": {
		pre: "",
		post: ""
	},
	"constraints": {
		"checks": "",
		"foreigns": "",
		"primaries": "",
		"uniques": ""
	},
	"contexts": "",
	"ddl": {
		"init": "",
		"patch": {
			"post": "",
			"pre": ""
		},
	},
	"dml": {
		"base": "",
		"init": "",
		"patch": {
			"post": "",
			"pre": ""
		},
	},
	"indexes": {
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
	},
	"views": "",
	"mviews": "",
	"tables": {
		// eslint-disable-next-line @typescript-eslint/naming-convention
		"tables_ddl": ""
	},
	"tests": {
		"packages": ""
	}
}];



/**
 * A multi-step input using window.createQuickPick() and window.createInputBox().
 *
 * This first part uses the helper class `MultiStepInput` that wraps the API for the multi-step case.
 */
export async function initializeProjectWizard(context: ExtensionContext) {

	interface State {
		title: string;
		step: number;
		totalSteps: number;

		projectName: string;
		projectType: QuickPickItem;
		dbConnection: string;
		dbAdminUser: string;
		dbAppPwd: string;

		createWorkspace: QuickPickItem;
		developerName: string;
		apexSchemaName: string;
	}

	async function collectInputs() {
		const state = {} as Partial<State>;
		if (workspace.workspaceFolders) {

			state.projectName = context.workspaceState.get("dbFlux_PROJECT") || "";
			state.dbConnection = context.workspaceState.get("dbFlux_DB_TNS") || "";
			state.dbAdminUser = context.workspaceState.get("dbFlux_DB_ADMIN_USER") || "";
			state.apexSchemaName = context.workspaceState.get("dbFlux_APEX_USER") || "";
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
			shouldResume: shouldResume,
			canSelectMany: false
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
		const appUserName = (state.projectType?.label==="SingleSchema")?state.projectName+"_app":state.projectName+"_depl";
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
			totalSteps: 6,
			value: state.dbAdminUser || 'sys',
			prompt: 'Enter name of an Admin-User (sys, admin, ...)',
			validate: validateValueNotRequiered,
			shouldResume: shouldResume
		});

		if (state.projectType?.label !== "FlexSchema") {
			return (input: MultiStepInput) => inputCreateWorkspace(input, state);
		}

	}

	async function inputCreateWorkspace(input: MultiStepInput, state: Partial<State>) {
		const answers = [{label:"Yes",}, {label:"No"}];
		state.createWorkspace = await input.showQuickPick({
			title,
			step: 6,
			totalSteps: 6,
			placeholder: 'Would you like to create workspace script?',
			items: answers,
			activeItem: answers[0],
			shouldResume: shouldResume,
			canSelectMany: false
		});

		return (input: MultiStepInput) => inputDevAdminName(input, state);
	}

	async function inputDevAdminName(input: MultiStepInput, state: Partial<State>) {
		state.developerName = await input.showInputBox({
			title,
			step: 7,
			totalSteps: 7,
			value: 'wsadmin',
			prompt: 'Enter name of workspace user (Admin/Developer) you want to create',
			validate: validateValueIsRequiered,
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
			{label: "FlexSchema",
		   description: "Multiple Schemas are supported and defined by folder names. Connection uses proxy syntax when not equals folder name."},
			{label: "MultiSchema",
		   description: "3 Schemas are supported data, logic, app. All prefixed with projectname. Connection is started with a proxy user depl."},
			{label: "SingleSchema",
			description: "There will be only one Schema named app and prefix with project name. Connection is startet with Schema-Owner."}
		];
	}

	const state = await collectInputs();


	function createFolders(state: State) {
		if (workspace.workspaceFolders) {

			const schemaDef:any = dbFolderDef;

			const dataSchema = state.projectName + "_data";
			const logicSchema = state.projectName + "_logic";
			const appSchema = state.projectName + "_app";

			const folderDef:any = {
				".hooks": {
						pre: "",
						post: ""
				},
				"apex" : "",
				"db" : {
					".hooks": {
						pre: "",
						post: ""
					},
					["_setup"]: {
						users: "",
						workspaces: ""
					},
					[dataSchema] : schemaDef,
					[logicSchema] : schemaDef,
					[appSchema] : schemaDef,
					},
				"reports": "",
				"rest": {
					"access": {
						mapping: "",
						roles: "",
						privileges: ""
					},
					"modules": ""
				},
				"static": ""
			};

			if (state.projectType.label === "SingleSchema") {
				delete folderDef.db[dataSchema];
				delete folderDef.db[logicSchema];
			} else if (state.projectType.label === "FlexSchema") {
				delete folderDef.db[dataSchema];
				delete folderDef.db[logicSchema];
				delete folderDef.db[appSchema];
			}

			createDirectoryPath(folderDef, "/", workspace.workspaceFolders[0].uri.fsPath) ;
		}
	}

	createFolders(state);

	const fcontent = {
		"title" : "dbFlux - Initialization summary",
		"files" : [],
		"userFile": "",
		"installFile": ""
	};

	async function writeUserScritps(state: State) {
		if (workspace.workspaceFolders) {

			const gitIgnore = path.resolve(workspace.workspaceFolders![0].uri.fsPath, ".gitignore");
			setLine(gitIgnore, '**/dist');

			if (state.projectType.label === "SingleSchema"){
				// write schema-user
				const singleUserFile = writeSingleUserCreationScript(state.projectName, state.dbAppPwd);
				setLine(gitIgnore, singleUserFile);
				(fcontent.files as string[]).push(singleUserFile);

			} else {
				// write proxy-user of MultiSchema and FlexSchema
				const proxyFile = writeProxyUserCreationScript(state.projectName, state.dbAppPwd);
				setLine(gitIgnore, proxyFile);
				(fcontent.files as string[]).push(proxyFile);

				// write schema users
				if (state.projectType.label === "MultiSchema") {
					const schemas = [`${state.projectName}_data`, `${state.projectName}_logic`, `${state.projectName}_app`];
					schemas.forEach((schema, index) => {
						(fcontent.files as string[]).push(writeUserCreationScript(index, schema, state.projectName));
					});
				}

			}


			// Workspace und initialen WSUser erstellen
			if (state.createWorkspace && state.createWorkspace.label === "Yes") {

				// Create Folder if not exists
				(fcontent.files as string[]).push(writeCreateWorkspaceScript(state.projectName, `${state.projectName}_app`));

				// Create Workspace Admin
				(fcontent.files as string[]).push(writeCreateWorkspaceAdminScript(state.projectName, state.developerName, `${state.projectName}_app`));
			}


			// write Summary Installation File
			{
				fcontent.installFile = `db/_setup/install.sql`;
				const userFile = path.resolve(workspace.workspaceFolders![0].uri.fsPath, fcontent.installFile);

				// create a install.sql
				writeInstallSQLFile((fcontent.files as string[]), userFile);

			}

		}
	}

	function getWebviewContent(content:any, state: State) {
    const template = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, "..", "..", "dist", state.projectType.label==="FlexSchema" ? "welcomeFlex.tmpl.html": "welcome.tmpl.html").split(path.sep).join('/'), "utf8"));
    return template(content);
  }

	function openWebView(state: State) {
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
    panel.webview.html = getWebviewContent(fcontent, state);
	}

	async function writeConfigFiles(state: State) {
		if (workspace.workspaceFolders) {
			context.workspaceState.update("dbFlux_mode", "dbFlux");
			context.workspaceState.update("dbFlux_DB_TNS", state.dbConnection);
			if (state.projectType.label === "SingleSchema") {
					context.workspaceState.update("dbFlux_DB_APP_USER", state.projectName.toLowerCase() + "_app");
			} else {
					context.workspaceState.update("dbFlux_DB_APP_USER", state.projectName.toLowerCase() + "_depl");
			}

			context.workspaceState.update("dbFlux_DB_APP_PWD", state.dbAppPwd);
			context.workspaceState.update("dbFlux_DB_ADMIN_USER", state.dbAdminUser);

			context.workspaceState.update("dbFlux_PROJECT", state.projectName.toLowerCase());
			if (state.projectType.label === "MultiSchema") {
					context.workspaceState.update("dbFlux_DATA_SCHEMA", state.projectName.toLowerCase() + "_data");
					context.workspaceState.update("dbFlux_LOGIC_SCHEMA", state.projectName.toLowerCase() + "_logic");
					context.workspaceState.update("dbFlux_APP_SCHEMA", state.projectName.toLowerCase() + "_app");
			} if (state.projectType.label === "SingleSchema") {
					context.workspaceState.update("dbFlux_DATA_SCHEMA", state.projectName.toLowerCase() + "_app");
					context.workspaceState.update("dbFlux_LOGIC_SCHEMA", state.projectName.toLowerCase() + "_app");
					context.workspaceState.update("dbFlux_APP_SCHEMA", state.projectName.toLowerCase() + "_app");
			}

			context.workspaceState.update("dbFlux_WORKSPACE", state.projectName.toLowerCase());
			context.workspaceState.update("dbFlux_APEX_USER", state.apexSchemaName.toUpperCase());
			context.workspaceState.update("dbFlux_FLEX_MODE", (state.projectType.label === "FlexSchema"));
		}

	}

	writeConfigFiles(state);
	writeUserScritps(state);
	openWebView(state);
	commands.executeCommand("dbFlux.reloadExtension");


	window.showInformationMessage(`Application structure for '${state.projectName}' successfully created`);
}


function writeInstallSQLFile(files:string[], userFile: string) {
	let content = "";
	files.forEach(file => {
		content += `@@${file}\n`;
	});

	fs.writeFileSync(userFile, content);

}

export function writeCreateWorkspaceAdminScript(workspaceName:string, workspaceAdminName:string, primaryWorkspaceSchema:string):string {
	{
		const relativeFile = `db/_setup/workspaces/${workspaceName}/create_01_user_${workspaceAdminName}.sql`;
		const userFile = path.resolve(workspace.workspaceFolders![0].uri.fsPath, relativeFile);
		const template = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, "..", "..", "dist", "create_workspace_user.tmpl.sql").split(path.sep).join(path.posix.sep), "utf8"));
		const content = {
			"app_schema": primaryWorkspaceSchema,
			"workspace": workspaceName,
			"user_name": workspaceAdminName,
		};

		fs.writeFileSync(userFile, template(content));

		return relativeFile;
	}
}

export function writeCreateWorkspaceScript(workspaceName:string, primaryWorkspaceSchema:string):string {
	const relativePath = `db/_setup/workspaces/${workspaceName}`;
	const wsPath = path.resolve(workspace.workspaceFolders![0].uri.fsPath, relativePath);

	// create folder
	if (!existsSync(wsPath)) {
		mkdirSync(wsPath, { recursive: true });
		commands.executeCommand('revealInExplorer', Uri.file(wsPath));
	}

	// Create script
	{
		const relativeFile = `${relativePath}/create_00_workspace.sql`;
		const workspaceFile = path.resolve(workspace.workspaceFolders![0].uri.fsPath, relativeFile);
		const template = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, "..", "..", "dist", "create_workspace.tmpl.sql").split(path.sep).join(path.posix.sep), "utf8"));
		const content = {
			"app_schema": primaryWorkspaceSchema,
			"workspace": workspaceName
		};

		fs.writeFileSync(workspaceFile, template(content));
		return relativeFile;
	}
}

function writeProxyUserCreationScript(projectName:string, proxyPassword:string) : string {
	const relativeFile = `db/_setup/users/00_create_${projectName}_depl.sql`;
	const proxyUser = path.resolve(workspace.workspaceFolders![0].uri.fsPath, relativeFile);
	const template = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, "..", "..", "dist", "user_proxy.tmpl.sql").split(path.sep).join(path.posix.sep), "utf8"));
	const content = {
		"proxy_user": `${projectName}_depl`,
		"db_app_pwd": proxyPassword
	};

	fs.writeFileSync(proxyUser, template(content));
	return relativeFile;
}

function writeSingleUserCreationScript(projectName:string, singlePassword:string) : string {
	const relativeFile = `db/_setup/users/01_create_${projectName}_app.sql`;
	const schemaUser = path.resolve(workspace.workspaceFolders![0].uri.fsPath, relativeFile);
	const template = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, "..", "..", "dist", "user_single_app.tmpl.sql").split(path.sep).join(path.posix.sep), "utf8"));
	const content = {
		"data_schema": `${projectName}_app`,
		"db_app_pwd": singlePassword
	};

	fs.writeFileSync(schemaUser, template(content));
	return relativeFile;
}

export function writeUserCreationScript(index: number, schema: string, projectName: string) {
	let idx = index+1;

	// when addionally add schema, this will be -1
	if (index === -1) {
		idx = fs.readdirSync(path.resolve(workspace.workspaceFolders![0].uri.fsPath, 'db/_setup/users')).length;
	}

	const relativeFile = `db/_setup/users/0${idx}_create_${schema}.sql`;
	const schemaUser = path.resolve(workspace.workspaceFolders![0].uri.fsPath, relativeFile);
	const template = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, "..", "..", "dist", "user_default.tmpl.sql").split(path.sep).join(path.posix.sep), "utf8"));
	const content = {
		"data_schema": schema,
		"proxy_user": `${projectName}_depl`,
	};

	fs.writeFileSync(schemaUser, template(content));
	return relativeFile;
}

export async function enableFlexMode(context: ExtensionContext, projectInfos:IProjectInfos) {
	const mode = getDBFlowMode(context);

	if (mode === "xcl") {
		window.showErrorMessage('dbFlux: xcl does not support FlexMode, yet!');
	} else {
		window.showInformationMessage("Do you realy want to enable FlexMode? This is not revertable!", ... ["Yes", "No"])
			.then(async (answer) => {
				if (answer === "Yes") {
					const wsName = projectInfos.workspace?projectInfos.workspace:projectInfos.projectName!;
					const wsRoot = getWorkspaceRootPath();

					// temp store
					renameSync(path.join(wsRoot, 'apex'), path.join(wsRoot, 'tempa_'+wsName));
					renameSync(path.join(wsRoot, 'static'), path.join(wsRoot, 'temps_'+wsName));
					renameSync(path.join(wsRoot, 'rest'), path.join(wsRoot, 'tempr_'+wsName));

					// create schemafolders inside apex, rest and static
					mkdirSync(path.join(wsRoot, 'apex', projectInfos.appSchema.toLowerCase()), {recursive:true});
					mkdirSync(path.join(wsRoot, 'rest'), {recursive:true});
					mkdirSync(path.join(wsRoot, 'static', projectInfos.appSchema.toLowerCase()), {recursive:true});

					// restore
					renameSync(path.join(wsRoot, 'tempa_'+wsName), path.join(wsRoot, 'apex', projectInfos.appSchema.toLowerCase(), wsName));
					renameSync(path.join(wsRoot, 'temps_'+wsName), path.join(wsRoot, 'static', projectInfos.appSchema.toLowerCase(), wsName));
					renameSync(path.join(wsRoot, 'tempr_'+wsName), path.join(wsRoot, 'rest', projectInfos.appSchema.toLowerCase()));


					if (mode === "dbFlow"){
						const file = path.join(wsRoot, "build.env");
						setEnvValue(file, "FLEX_MODE", "TRUE");
					} else if (mode === "dbFlux"){
						context.workspaceState.update("dbFlux_FLEX_MODE", true);
					}

					window.showInformationMessage("Your Project is now in FlexMode!");
					commands.executeCommand("dbFlux.reloadExtension");
				}
			});
	}

}

export function getFilesForInstallSQL() {
	const rootPath = workspace.workspaceFolders![0].uri.fsPath;
	const files:string[] = [];
	const getFiles = (source: string) =>
          readdirSync(path.join(rootPath, source), { withFileTypes: true })
          .filter((dirent) => {
            return dirent.isFile() && dirent.name.endsWith(".sql");
          })
          .map((dirent) => path.join(source, dirent.name).replace(/\\/g, '/'));

	const getFolders = (source: string) =>
          readdirSync(path.join(rootPath, source), { withFileTypes: true })
          .filter((dirent) => {
            return dirent.isDirectory();
          })
          .map((dirent) =>  dirent.name);

	const getWorkspacesFiles = (source: string):string[] => {
		const folders:string[] = [];
		getFolders(source).forEach(folder => {
			folders.push(... getFiles(source + "/" + folder));
		});
		return folders;
	};

	files.push (... getFiles("db/_setup/users"));
	files.push (... getWorkspacesFiles("db/_setup/workspaces"));

	return files;
}

export function rewriteInstall() {
	{
		const installFile = `db/_setup/install.sql`;
		const userFile = path.resolve(workspace.workspaceFolders![0].uri.fsPath, installFile);
		if (existsSync(userFile)) {

			writeInstallSQLFile(getFilesForInstallSQL(), userFile);
		}

	}
}

export function registerEnableFlexModeCommand(projectInfos: IProjectInfos, context: ExtensionContext) {
  return commands.registerCommand("dbFlux.enableFlexMode", async () => {
    if (!projectInfos.isFlexMode) {
      enableFlexMode(context, projectInfos);
    } else {
      window.showErrorMessage('dbFlux: FlexMode allready set!');
    }
  });
}

export function registerResetPasswordCommand() {
  return commands.registerCommand("dbFlux.resetPassword", async () => {
    CompileTaskStore.getInstance().appPwd = undefined;
    CompileTaskStore.getInstance().adminPwd = undefined;
    window.showInformationMessage("dbFlux: Password succefully reset");
  });
}