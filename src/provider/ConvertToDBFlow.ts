import { execSync } from "child_process";
import * as fs from "fs";
import { chmodSync, existsSync } from "fs";
import * as Handlebars from "handlebars";
import * as path from "path";
import { commands, ExtensionContext, QuickPickItem, ShellExecution, Task, TaskDefinition, TaskProvider, tasks, TaskScope, Uri, window, workspace } from "vscode";
import { ConfigurationManager, rmDBFluxConfig } from "../helper/ConfigurationManager";
import { getWorkspaceRootPath } from "../helper/utilities";
import { AbstractBashTaskProvider, getProjectInfos, IBashInfos, IProjectInfos } from "./AbstractBashTaskProvider";



interface ConvertTaskDefinition extends TaskDefinition {
  name: string;
  runner: IBashInfos;
}


export class ConvertToDBFlowProvider extends AbstractBashTaskProvider implements TaskProvider {
  static dbFluxType: string = "dbFlux";

  provideTasks(): Thenable<Task[]> | undefined {
    return this.getExpTasks();
  }

  resolveTask(task: Task): Task | undefined {
    return task;
  }


  async getExpTasks(): Promise<Task[]> {
    const result: Task[] = [];

    const runTask: IBashInfos = await this.prepExportInfos();
    result.push(this.createConverTask(this.createConverTaskDefinition("convert2dbFlow", runTask)));

    return Promise.resolve(result);
  }

  createConverTaskDefinition(name: string, runner: IBashInfos): ConvertTaskDefinition {
    return {
      type: ConvertToDBFlowProvider.dbFluxType,
      name,
      runner
    };
  }

  createConverTask(definition: ConvertTaskDefinition): Task {

    let _task = new Task(
      definition,
      TaskScope.Workspace,
      definition.name,
      ConvertToDBFlowProvider.dbFluxType,
      new ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_DBTNS:     definition.runner.connectionTns,
          DBFLOW_DBUSER:    definition.runner.connectionUser,
          DBFLOW_DBPASS:    definition.runner.connectionPass,
        },
      })

    );
    _task.presentationOptions.echo = false;


    return _task;
  }

  async prepExportInfos(): Promise<IBashInfos> {
    let runnerInfo: IBashInfos = {} as IBashInfos;

    let projectInfos: IProjectInfos = await getProjectInfos(this.context);

    runnerInfo.runFile  = path.resolve(__dirname, "..", "..", "dist", "shell", "gen_dbflow.sh").split(path.sep).join(path.posix.sep);
    if (existsSync(runnerInfo.runFile)) {
      chmodSync(runnerInfo.runFile, 0o755);
    }

    runnerInfo.cwd      = path.dirname(getWorkspaceRootPath());
    runnerInfo.projectInfos   = projectInfos;

    return runnerInfo;
  }

}



export function registerConvert2dbFLow(projectInfos: IProjectInfos, command: string, context: ExtensionContext) {
  return commands.registerCommand(command, async () => {
    const ws = getWorkspaceRootPath();

    // write dbFlow build file
    const buildTemplate = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, "..", "..", "dist", "templates", "build.tmpl.env").split(path.sep).join('/'), "utf8"));
    const buildContent = projectInfos;
    const buildFile = path.join(ws, "build.env");
    fs.writeFileSync(buildFile, buildTemplate(buildContent));

    // write dbFlow apply file
    const applyTemplate = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, "..", "..", "dist", "templates", "apply.tmpl.env").split(path.sep).join('/'), "utf8"));
    const applyContent:any = projectInfos;
    applyContent.sqlCLI = ConfigurationManager.getCliToUseForCompilation();
    const applyFile = path.join(ws, "apply.env");
    fs.writeFileSync(applyFile, applyTemplate(applyContent));

    const removeLines = (data: string, lines:string[] = []) => {
      return data
          .split('\n')
          .filter((val, idx) => !lines.includes(val))
          .join('\n');
    }

    fs.readFile(buildFile, 'utf8', (err, data) => {
        if (err) throw err;

        fs.writeFile(buildFile, removeLines(data, ["LOGIC_SCHEMA=", "DATA_SCHEMA="]), 'utf8', function(err) {
            if (err) throw err;
        });
    })

    // initialize dbFlow as submodule
    context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new ConvertToDBFlowProvider(context)));
    await commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: convert2dbFlow");


  });
}