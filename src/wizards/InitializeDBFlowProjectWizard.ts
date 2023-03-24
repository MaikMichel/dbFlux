
import { ExtensionContext, workspace } from "vscode";
import { getWorkspaceRootPath } from "../helper/utilities";
import { State } from "../provider/GenerateDPFlowProjectProvider";
import { getAvailableProjectTypes } from "./InitializeProjectWizard";
import { MultiStepInput } from "./InputFlowAction";
import * as path from "path";
import * as dotenv from "dotenv";


export async function initializeDBFlowProjectWizard(context: ExtensionContext) : Promise<State> {

  const ws = getWorkspaceRootPath();

  async function collectInputs() {
    const state = {} as Partial<State>;
    const applyEnv = dotenv.config({ path: path.join(ws, "apply.env")});
    const buildEnv = dotenv.config({ path: path.join(ws, "build.env")});

    state.title      = 'Initialize dbFlow Project';
    state.totalSteps = 14;

    state.projectName      = buildEnv.parsed?.PROJECT;
    state.projectType      = buildEnv.parsed?.PROJECT_MODE;
    state.buildBranch      = buildEnv.parsed?.BUILD_BRANCH;
    // state.createChangelogs = buildEnv.parsed?.CHANGELOG_SCHEMA?"Yes":"No";
    state.changeLogSchema  = buildEnv.parsed?.CHANGELOG_SCHEMA;

    state.dbConnection = applyEnv.parsed?.DB_TNS;
    state.dbAdminUser  = applyEnv.parsed?.DB_ADMIN_USER;
    state.dbAppUser    = applyEnv.parsed?.DB_APP_USER;
    state.depotPath    = applyEnv.parsed?.DEPOT_PATH;
    state.stageBranch  = applyEnv.parsed?.STAGE;

    await MultiStepInput.run(input => inputProjectName(input, state));

    return state as State;
  }

  async function inputProjectName(input: MultiStepInput, state: Partial<State>) {
    state.projectName = await input.showInputBox({
      title:        state.title!,
      step:         1,
      totalSteps:   state.totalSteps!,
      value:        state.projectName || workspace.name!,
      prompt:       'Choose a Name for your project, this will be part of schema name[s] -',
      validate:     validateRequiredValueOnlyNumbersAlphaUScore,
      shouldResume: shouldResume
    });

    return (input: MultiStepInput) => pickProjectType(input, state);
  }

  async function pickProjectType(input: MultiStepInput, state: Partial<State>) {
    const projectTypes = await getAvailableProjectTypes();
    const currentProject = projectTypes.filter(value => {
      return value.label.charAt(0).toUpperCase() === state.projectType!.charAt(0).toUpperCase()
    })[0];

    state.projectType = await input.showQuickPick({
      title:         state.title!,
      step:          2,
      totalSteps:    state.totalSteps!,
      placeholder:  'Pick a type',
      items:         projectTypes,
      activeItem:    currentProject || projectTypes[0],
      shouldResume:  shouldResume,
      canSelectMany: false
    }).then(value => value.label);

    return (input: MultiStepInput) => inputBranchName(input, state);
  }

  async function inputBranchName(input: MultiStepInput, state: Partial<State>) {
    state.buildBranch = await input.showInputBox({
      title:         state.title!,
      step:          3,
      totalSteps:    state.totalSteps!,
      value:         state.buildBranch || 'build',
      prompt:       'When running release tests, what is your prefered branch name? - ',
      validate:      validateRequiredValueOnlyNumbersAlphaUScore,
      shouldResume:  shouldResume
    });

    return (input: MultiStepInput) => inputProcessChangeLogs(input, state);
  }

  async function inputProcessChangeLogs(input: MultiStepInput, state: Partial<State>) {
    const answers = [{label:"Yes"}, {label:"No"}];
    state.createChangelogs = await input.showQuickPick({
      title:          state.title!,
      step:           4,
      totalSteps:     state.totalSteps!,
      items:          answers,
      activeItem:     answers[0],
      placeholder:   'Would you like to process changelogs during deployment?',
      canSelectMany:  false,
      shouldResume:   shouldResume
    }).then(value => value.label);

    if (state.createChangelogs === "Yes") {
      if (state.projectType === "SingleSchema") {
        state.changeLogSchema = state.projectName;
      } else if (state.projectType === "MultiSchema") {
        state.totalSteps!++;
        await inputChangelogSchemaMulti(input, state);
      } else {
        state.totalSteps!++;
        await inputChangelogSchema(input, state)
      }
    }

    return (input: MultiStepInput) => inputConnection(input, state);
  }

  async function inputChangelogSchema(input: MultiStepInput, state: Partial<State>) {
    state.changeLogSchema = await input.showInputBox({
      title:         state.title!,
      step:          5,
      totalSteps:    state.totalSteps!,
      value:         state.changeLogSchema || state.projectName + '_app',
      prompt:       'What is the schema name the changelog is processed with? - ',
      validate:      validateRequiredValueOnlyNumbersAlphaUScore,
      shouldResume:  shouldResume
    });
  }

  async function inputChangelogSchemaMulti(input: MultiStepInput, state: Partial<State>) {
    const answers = [{label:state.projectName+"_data"}, {label:state.projectName+"_logic"}, {label:state.projectName+"_app"}];
    state.changeLogSchema = await input.showQuickPick({
      title:           state.title!,
      step:            5,
      totalSteps:      state.totalSteps!,
      items:           answers,
      activeItem:      answers[0],
      placeholder:    'What is the schema name the changelog is processed with',
      shouldResume:    shouldResume,
      canSelectMany:   false
    }).then(value => value.label);
  }

  async function inputConnection(input: MultiStepInput, state: Partial<State>) {
    state.dbConnection = await input.showInputBox({
      title:        state.title!,
      step:         6,
      totalSteps:   state.totalSteps!,
      value:        state.dbConnection || 'localhost:1521/xepdb1',
      prompt:       'Enter connection string (localhost:1521/xepdb1) - ',
      validate:     validateValueIsRequiered,
      shouldResume: shouldResume
    });

    return (input: MultiStepInput) => inputAdminUserName(input, state);
  }

  async function inputAdminUserName(input: MultiStepInput, state: Partial<State>) {
    state.dbAdminUser = await input.showInputBox({
      title:        state.title!,
      step:         7,
      totalSteps:   state.totalSteps!,
      value:        state.dbAdminUser || 'sys',
      prompt:       'Enter username of admin user (admin, sys) - ',
      validate:     validateValueIsRequiered,
      shouldResume: shouldResume
    });

    return (input: MultiStepInput) => inputAdminUserPwd(input, state);
  }

  async function inputAdminUserPwd(input: MultiStepInput, state: Partial<State>) {
    state.dbAdminPwd = await input.showInputBox({
      title:        state.title!,
      step:         8,
      totalSteps:   state.totalSteps!,
      value:        state.dbAdminPwd || '',
      prompt:       `Enter Password for user ${state.dbAdminUser} [Leave blank and you will be asked for] - `,
      validate:     validateValueNotRequiered,
      shouldResume: shouldResume,
      password:     true
    });

    return (input: MultiStepInput) => inputDeplUserPwd(input, state);
  }

  async function inputDeplUserPwd(input: MultiStepInput, state: Partial<State>) {
    state.dbAppUser = (state.projectType==="SingleSchema")?state.projectName:state.projectName+"_depl";
    state.dbAppPwd = await input.showInputBox({
      title:        state.title!,
      step:         9,
      totalSteps:   state.totalSteps!,
      value:        state.dbAppPwd || '',
      prompt:       `Enter password for deployment_user ${state.dbAppUser} [leave blank and you will be asked for] - `,
      validate:     validateValueNotRequiered,
      shouldResume: shouldResume,
      password:     true
    });

    return (input: MultiStepInput) => inputPathToDepot(input, state);
  }

  async function inputPathToDepot(input: MultiStepInput, state: Partial<State>) {
    state.depotPath = await input.showInputBox({
      title:        state.title!,
      step:         10,
      totalSteps:   state.totalSteps!,
      value:        state.depotPath || '_depot',
      prompt:       'Enter path to depot - ',
      validate:     validateValueIsRequiered,
      shouldResume: shouldResume
    });

    return (input: MultiStepInput) => inputStageMappedToBranch(input, state);
  }

  async function inputStageMappedToBranch(input: MultiStepInput, state: Partial<State>) {
    state.stageBranch = await input.showInputBox({
      title:        state.title!,
      step:         11,
      totalSteps:   state.totalSteps!,
      value:        state.stageBranch || 'develop',
      prompt:       'Enter stage of this configuration mapped to branch (develop, test, master) - ',
      validate:     validateValueIsRequiered,
      shouldResume: shouldResume
    });

    return (input: MultiStepInput) => inputInstallTooling(input, state);
  }

  async function inputInstallTooling(input: MultiStepInput, state: Partial<State>) {
    const answers = [{label:"Yes"}, {label:"No"}];

    state.includeDefaultTools = await input.showQuickPick({
      title:          state.title!,
      step:           12,
      totalSteps:     state.totalSteps!,
      items:          answers,
      activeItem:     answers[0],
      placeholder:    'Do you wish to generate and install default tooling? (Logger, utPLSQL, teplsql, tapi) - ',
      canSelectMany:  false,
      shouldResume:   shouldResume
    }).then(value => value.label);

    return (input: MultiStepInput) => inputSqlCli(input, state);
  }

  async function inputSqlCli(input: MultiStepInput, state: Partial<State>) {
    const answers = [{label:"sqlcl"}, {label:"sqlplus"}];

    state.sqlcli = await input.showQuickPick({
      title:          state.title!,
      step:           13,
      totalSteps:     state.totalSteps!,
      items:          answers,
      activeItem:     answers[1],
      placeholder:    'Run installation and build tasks with either sql(cl) or sqlplus - ',
      canSelectMany:  false,
      shouldResume:   shouldResume
    }).then(value => value.label);

    return (input: MultiStepInput) => inputDefaultApps(input, state);
  }

  async function inputDefaultApps(input: MultiStepInput, state: Partial<State>) {
    state.defaultApps = await input.showInputBox({
      title:        state.title!,
      step:         14,
      totalSteps:   state.totalSteps!,
      value:        '',
      prompt:       `Enter application IDs (comma separated) you wish to use initialy (100,101,...) - `,
      validate:     validateValueNotRequiered,
      shouldResume: shouldResume,
    });

    return (input: MultiStepInput) => inputDefaultModules(input, state);
  }

  async function inputDefaultModules(input: MultiStepInput, state: Partial<State>) {
    state.defaulsModules = await input.showInputBox({
      title:        state.title!,
      step:         15,
      totalSteps:   state.totalSteps!,
      value:        '',
      prompt:       `Enter restful Moduls (comma separated) you wish to use initialy (api,test,...) - `,
      validate:     validateValueNotRequiered,
      shouldResume: shouldResume,
    });

  }

  function shouldResume() {
    // Could show a notification with the option to resume.
    return new Promise<boolean>((resolve, reject) => {
      return true;
    });
  }

  async function validateValueIsRequiered(name: string) {
    return (name == undefined || name.length === 0) ? 'Value is required' : undefined;
  }

  async function validateRequiredValueOnlyNumbersAlphaUScore(name: string) {
    return (name == undefined || name.length === 0) ? 'Value is required' : (!name.toLowerCase().match(/^[0-9a-z_]+$/)) ? 'Value not a valid schema name' : undefined;
  }

  async function validateValueNotRequiered(name: string) {
    // eslint-disable-next-line eqeqeq
    return undefined;
  }

  /********************************* */
  const state = await collectInputs();
  console.log('state', state);

  /*const termName = 'dbFLow';

  const term = window.createTerminal({name:termName,
    env: {
      "wiz_project_name":      state.projectName,
      "wiz_project_mode":      state.projectType.charAt(0),
      "wiz_build_branch":      state.buildBranch,
      "wiz_create_changelogs": state.createChangelogs.charAt(0),
      "wiz_chl_schema":        state.changeLogSchema,
      "wiz_db_tns":            state.dbConnection,
      "wiz_db_admin_user":     state.dbAdminUser,
      "wiz_db_admin_pwd":      state.dbAdminPwd,
      "wiz_db_app_user":       state.dbAppUser,
      "wiz_db_app_pwd":        state.dbAppPwd,
      "wiz_depot_path":        state.depotPath,
      "wiz_stage":             state.stageBranch,
      "wiz_sqlcli":            state.sqlcli,
      "wiz_with_tools":        state.includeDefaultTools.charAt(0),
      "wiz_apex_ids":          state.defaultApps,
      "wiz_rest_modules":      state.defaulsModules,
      "env_only": "NO"
    }
  });


    window.onDidCloseTerminal(event => {
      if (term && termName === event.name) {
        term.dispose();
      }
    });


    term.show(true);
    if (!existsSync(path.join(ws, '.git'))) {
      term.sendText(`# Initializing git`);
      term.sendText(`git init`);
    }
    console.log(".dbFlow", );
    if (!existsSync(path.join(ws, '.dbFLow'))) {

      term.sendText(`# clone dbFlow as submodule`);
      term.sendText(`git submodule add --force https://github.com/MaikMichel/dbFlow.git .dbFlow`);

      term.sendText(`# dbFlow initialized`);
      term.sendText(`# Documentation can be found here: https://maikmichel.github.io/dbFlow`);
    } else {
      term.sendText(`# pulling changes from dbFLow submodule`);
      term.sendText(`cd .dbFlow`);
      term.sendText(`git pull`);
      term.sendText(`cd ..`);
    }

    term.sendText(`.dbFLow/setup.sh -g \"${state.projectName}\" -w`);

    commands.executeCommand("workbench.action.terminal.focus");

    window
      .showInformationMessage("Workspace will now be initialized. Just wait a moment and hit reload to reload dbFlux settings", "Reload", "Cancel")
        .then(answer => {
          if (answer === "Reload") {
            // Run function
            commands.executeCommand("dbFlux.reloadExtension");
          }
        })
        */
    return state;

}