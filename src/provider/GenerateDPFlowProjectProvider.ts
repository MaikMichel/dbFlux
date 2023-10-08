import { chmodSync, existsSync } from "fs";

import * as path from "path";
import { commands, ExtensionContext, ShellExecution, Task, TaskDefinition, TaskProvider, tasks, TaskScope} from "vscode";
import { getWorkspaceRootPath } from "../helper/utilities";
import { initializeDBFlowProjectWizard } from "../wizards/InitializeDBFlowProjectWizard";
import { AbstractBashTaskProvider, getProjectInfos, IBashInfos, IProjectInfos } from "./AbstractBashTaskProvider";



export interface State {
  title:      string;
  step:       number;
  totalSteps: number;

  projectName:         string;           // project_name
  projectType:         string;           // project_mode

  dbConnection:        string;           // db_tns
  dbAdminUser:         string;           // db_admin_user
  dbAdminPwd:          string;           // db_admin_pwd

  dbAppUser:           string;           // db_app_user
  dbAppPwd:            string;           // db_app_pwd

  buildBranch:         string;           // build_branch
  createChangelogs:    string;           // create_changelogs
  changeLogSchema:     string;           // chl_schema
  depotPath:           string;           // depot_path
  stageBranch:         string;           // stageBranch
  sqlcli:              string;           // sqlcli
  includeDefaultTools: string;           // with_tools

  defaultApps:         string;           // 100,200
  defaulsModules:      string;           // api,test

  logtopath:           string;           // log to path

}

interface GenerateDBFlowTaskDefinition extends TaskDefinition {
  name: string;
  runner: IBashInfos;
  state: State;
}

export class GenerateDPFlowProjectProvider extends AbstractBashTaskProvider implements TaskProvider {
  static dbFluxType: string = "dbFlux";
  state: State;

  constructor(context: ExtensionContext, state: State) {
    super(context);
    this.state = state;
  }

  async provideTasks(): Promise<Task[] | undefined> {
    return await this.getGenerateTask();
  }

  resolveTask(task: Task): Task | undefined {
    return task;
  }


  async getGenerateTask(): Promise<Task[]> {
    const result: Task[] = [];

    const runTask: IBashInfos = this.prepExportInfos();

    // const state = await initializeDBFlowProjectWizard(this.context);
    result.push(this.createCreateTask(this.createCreateDBFlowTaskDefinition("createDBFlow", runTask, this.state)));

    return Promise.resolve(result);
  }

  createCreateDBFlowTaskDefinition(name: string, runner: IBashInfos, state: State): GenerateDBFlowTaskDefinition {
    return {
      type: GenerateDPFlowProjectProvider.dbFluxType,
      name,
      runner,
      state
    };
  }

  createCreateTask(definition: GenerateDBFlowTaskDefinition): Task {

    let _task = new Task(
      definition,
      TaskScope.Workspace,
      definition.name,
      GenerateDPFlowProjectProvider.dbFluxType,
      new ShellExecution(definition.runner.runFile, {
        env: {
          "wiz_project_name":      definition.state.projectName,
          "wiz_project_mode":      definition.state.projectType.charAt(0),
          "wiz_build_branch":      definition.state.buildBranch,
          "wiz_create_changelogs": definition.state.createChangelogs.charAt(0),
          "wiz_chl_schema":        definition.state.changeLogSchema,
          "wiz_db_tns":            definition.state.dbConnection,
          "wiz_db_admin_user":     definition.state.dbAdminUser,
          "wiz_db_admin_pwd":      definition.state.dbAdminPwd,
          "wiz_db_app_user":       definition.state.dbAppUser,
          "wiz_db_app_pwd":        definition.state.dbAppPwd,
          "wiz_depot_path":        definition.state.depotPath,
          "wiz_stage":             definition.state.stageBranch,
          "wiz_sqlcli":            definition.state.sqlcli,
          "wiz_with_tools":        definition.state.includeDefaultTools.charAt(0),
          "wiz_apex_ids":          definition.state.defaultApps,
          "wiz_rest_modules":      definition.state.defaulsModules,
          "wiz_logpath":           definition.state.logtopath,
          "env_only": "NO"
        },
      })

    );
    _task.presentationOptions.echo = false;


    return _task;
  }

  prepExportInfos(): IBashInfos {
    let runnerInfo: IBashInfos = {} as IBashInfos;

    // this.setInitialCompileInfo("export_app.sh", apexUri, runner);
    // taken from setInitialCompileInfo
    let projectInfos: IProjectInfos = getProjectInfos(this.context);

    runnerInfo.runFile  = path.resolve(__dirname, "..", "..", "dist", "shell", "create_dbflow.sh").split(path.sep).join(path.posix.sep);
    if (existsSync(runnerInfo.runFile)) {
      chmodSync(runnerInfo.runFile, 0o755);
    }

    runnerInfo.cwd      = path.dirname(getWorkspaceRootPath());
    runnerInfo.projectInfos   = projectInfos;

    return runnerInfo;
  }

}



export function registerCreateDBFlowProject(command: string, context: ExtensionContext) {
  return commands.registerCommand(command, async () => {
    // initializeProjectWizard(context)
    const state = await initializeDBFlowProjectWizard(context);
     // initialize dbFlow as submodule
     context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new GenerateDPFlowProjectProvider(context, state)));

     await commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: createDBFlow");
  })
}
