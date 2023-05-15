/* eslint-disable @typescript-eslint/naming-convention */
import * as path from "path";
import * as fs from "fs";
import * as Handlebars from "handlebars";

import { AbstractBashTaskProvider, IBashInfos, IProjectInfos } from "./AbstractBashTaskProvider";
import { commands, ExtensionContext, ShellExecution, Task, TaskDefinition, TaskProvider, tasks, TaskScope, Uri, window, workspace } from "vscode";
import { CompileTaskStore, setAppPassword } from "../stores/CompileTaskStore";
import { ConfigurationManager } from "../helper/ConfigurationManager";
import { getWorkingFile, getWorkspaceRootPath, ltrim, matchRuleShort } from "../helper/utilities";
import { existsSync } from "fs";

import { ExportTableJSONStore } from "../stores/ExportTableJSONStore";

const which = require('which');

interface ExportTaskDefinition extends TaskDefinition {
  name: string;
  runner: ISQLExportInfos;
}

interface ISQLExportInfos extends IBashInfos {
  exportTable:        string;
  executableCli:      string;
  exportToDir:        string;
}



export class ExportTableAsJSONProvider extends AbstractBashTaskProvider implements TaskProvider {
  static dbFluxType: string = "dbFlux";

  provideTasks(): Thenable<Task[]> | undefined {
    return this.getExportObjectTask();
  }

  resolveTask(task: Task): Task | undefined {
    return task;
  }


  async getExportObjectTask(): Promise<Task[]> {
    const result: Task[] = [];
    const runTask: ISQLExportInfos = await this.prepExportInfos();

    result.push(this.createExpTask(this.createExpTaskDefinition("exportCurrentTableAsJSONDefinition", runTask)));


    return Promise.resolve(result);
  }

  createExpTaskDefinition(name: string, runner: ISQLExportInfos): ExportTaskDefinition {
    return {
      type: ExportTableAsJSONProvider.dbFluxType,
      name,
      runner,
    };
  }

  createExpTask(definition: ExportTaskDefinition): Task {
    let _task = new Task(
      definition,
      TaskScope.Workspace,
      definition.name,
      ExportTableAsJSONProvider.dbFluxType,
      new ShellExecution(definition.runner.runFile, {
        env: {
          DBFLOW_SQLCLI:      definition.runner.executableCli,
          DBFLOW_DBTNS:       definition.runner.connectionTns,
          DBFLOW_DBUSER:      definition.runner.connectionUser,
          DBFLOW_DBPASS:      definition.runner.connectionPass,
          DBFLOW_EXP_TABLE:   definition.runner.exportTable,
          DBFLOW_EXP_TODIR:   definition.runner.exportToDir
        },
      })

    );
    _task.presentationOptions.echo = false;

    return _task;
  }

  async prepExportInfos(): Promise<ISQLExportInfos> {
    let runner: ISQLExportInfos = {} as ISQLExportInfos;

    if (workspace.workspaceFolders) {

      let fileName = await getWorkingFile();
      const relativeFileName = fileName.replace(getWorkspaceRootPath() + "/", "")

      if (relativeFileName && fileExists(fileName)) {
        const tablename = path.basename(fileName).split('.')[0].toLowerCase();

        runner.executableCli       = ConfigurationManager.getCliToUseForCompilation();
        runner.exportTable         = tablename;
        runner.exportToDir         = 'db/' + relativeFileName.split('/')[1] + '/tables/.descs';

        this.setInitialCompileInfo("export_table_json.sh", Uri.file(fileName), runner);
        ExportTableJSONStore.getInstance().fileName=runner.exportToDir+'/'+runner.exportTable+'.json';
      }


    } else {
      throw "Error workspace.workspaceFolders or schemaName undefined"
    }

    return runner;
  }

}


export function registerExportCurrentTableDefinitionCommand(projectInfos: IProjectInfos, context: ExtensionContext) {
  return commands.registerCommand("dbFlux.exportCurrentTableAsJSONDefinition", async () => {

    // check what file has to build
    let fileName = await getWorkingFile();
    const relativeFileName = fileName.replace(getWorkspaceRootPath() + "/", "")

    const insideTable = matchRuleShort(relativeFileName, 'db/*/tables/*');

    if (insideTable) {
      if (projectInfos.isValid) {
        setAppPassword(projectInfos);

        if (CompileTaskStore.getInstance().appPwd !== undefined) {

          which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
            context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new ExportTableAsJSONProvider(context)));
            await commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: exportCurrentTableAsJSONDefinition");
          }).catch(() => {
            window.showErrorMessage('dbFlux: No executable "sql" found on path!');
          });
        }
      }
    } else {
      window.showErrorMessage('dbFlux: This works only when a table filde is currently selected!');
    }

  });
};


// function genFile():string {
//   const inFileName = getWorkspaceRootPath() + "/" + ExportTableJSONStore.getInstance().fileName;
//   const outFileName = inFileName + '.sql'
//   const sourceContent = fs.readFileSync(inFileName!, {encoding: 'utf8'});



//   Handlebars.registerHelper('eachbut', function(list, k, v, opts) {
//     // console.log(arguments);
//       let i, result = '';
//       const splitValues = v.split(':');
//       console.log('splitValues', splitValues);
//       console.log('list', list);
//       for (i = 0; i < list.length; ++i) {
//         // console.log('list[i][k]', list[i][k], splitValues.index(list[i][k]));
//         console.log('list[i]', k, list[i][k]);
//         if (splitValues.index(list[i][k])<0) {
//           result += opts.fn(list[i]);
//         }
//       }

//       return result;
//   });

//   const template = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, "..", "..", "dist", "templates", "test.sql").split(path.sep).join('/'), "utf8"));
//   fs.writeFileSync(outFileName, template(JSON.parse(sourceContent)));
//   return outFileName;
// }

// export function processTableJSON(projectInfos: IProjectInfos, context: ExtensionContext):void {
//   console.log('ExportTableJSONStore.getInstance().fileName', ExportTableJSONStore.getInstance().fileName);
//   const outFile = genFile();
//   console.log('outFile', outFile);
// }

function fileExists(activeFilePath: string):boolean {
 const ret = existsSync(path.format(path.parse(activeFilePath))) || existsSync(path.format(path.parse(ltrim(activeFilePath, '/'))));
 return ret;
}
