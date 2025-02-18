/* eslint-disable @typescript-eslint/naming-convention */

import { commands, ExtensionContext, QuickPickItem, QuickPickItemKind, Range, ShellExecution, Task, TaskDefinition, TaskProvider, tasks, TaskScope, Uri, ViewColumn, window, workspace } from "vscode";
import * as path from "path";
import * as Handlebars from "handlebars";
import { getPassword, getWorkingFile, getWorkspaceRootPath, matchRuleShort } from "../helper/utilities";
import { AbstractBashTaskProvider, getDBSchemaFolders, getDBUserFromPath, getProjectInfos, IBashInfos, IProjectInfos } from "./AbstractBashTaskProvider";
import { ConfigurationManager } from "../helper/ConfigurationManager";
import { TestTaskStore } from "../stores/TestTaskStore";
import { CompileTaskStore, setAppPassword } from "../stores/CompileTaskStore";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";

import { parse } from "junit2json";
import { LoggingService } from "../helper/LoggingService";


const which = require('which');

interface TestTaskDefinition extends TaskDefinition {
  name: string;
  runner: ISQLTestInfos;
}

interface ISQLTestInfos extends IBashInfos {
  connectionArray:    string[];
  connectionPasses:   string[];
  executableCli:      string;
  fileToTest:         string;
  methodToTest:       string;
  targetToCover:      string;
}

export class TestTaskProvider extends AbstractBashTaskProvider implements TaskProvider {
  static dbFluxType: string = "dbFlux";

  constructor(context: ExtensionContext, private mode:string){
    super(context);
  };

  provideTasks(): Thenable<Task[]> | undefined {
    return this.getTestTasks();
  }

  resolveTask(task: Task): Task | undefined {
    return task;
  }


  async getTestTasks(): Promise<Task[]> {
    const result: Task[] = [];

    const runTask: ISQLTestInfos = await this.prepTestInfos();

    result.push(this.createTestTask(this.createTestTaskDefinition(this.mode, runTask)));

    return Promise.resolve(result);
  }

  createTestTaskDefinition(name: string, runner: ISQLTestInfos): TestTaskDefinition {
    return {
      type: TestTaskProvider.dbFluxType,
      name,
      runner,
    };
  }

  createTestTask(definition: TestTaskDefinition): Task {
    let _task = new Task(
      definition,
      TaskScope.Workspace,
      definition.name,
      TestTaskProvider.dbFluxType,
      new ShellExecution(definition.runner.runFile, definition.runner.connectionArray, {
        env: {
          DBFLOW_SQLCLI:     definition.runner.executableCli,
          DBFLOW_DBTNS:      definition.runner.connectionTns,
          DBFLOW_DBPASS:     definition.runner.connectionPass,
          DBFLOW_DBPASSES:   definition.runner.connectionPasses.join("°"),
          DBFLOW_FILE2TEST:  this.mode === "executeTests" ? "" : definition.runner.fileToTest,
          DBFLOW_METHOD2TEST: this.mode === "executeTests" || this.mode === "executeTestPackageWithCodeCoverage" ? "" : definition.runner.methodToTest.length > 0 ? "."+definition.runner.methodToTest : "",
          DBFLOW_TARGET2COVER: this.mode === "executeTests" || this.mode !== "executeTestPackageWithCodeCoverage" ? "" : definition.runner.targetToCover.length > 0 ? definition.runner.targetToCover : "",
          DBFLOW_TESTOUTPUT:  ConfigurationManager.getTestOutputFormat()
        }
      })

    );
    _task.presentationOptions.echo = false;


    return _task;
  }

  async prepTestInfos(): Promise<ISQLTestInfos> {
    let runner: ISQLTestInfos = {} as ISQLTestInfos;

    if (workspace.workspaceFolders) {
      let fileUri:Uri = workspace.workspaceFolders[0].uri;
      let apexUri:Uri = Uri.file(path.join(fileUri.fsPath, 'apex/f0000/install.sql'));

      if (apexUri !== undefined) {
        await this.setInitialCompileInfo("test.sh", apexUri, runner);
        const projectInfos = await getProjectInfos(this.context);
        if (TestTaskStore.getInstance().selectedSchemas) {
          runner.connectionArray = TestTaskStore.getInstance().selectedSchemas!.map((element) =>{
            return '"' + this.buildConnectionUser(projectInfos, element) +'"';
          });
          runner.connectionPasses = TestTaskStore.getInstance().selectedSchemas!.map((element) =>{
            return '"' + getPassword(projectInfos, this.buildConnectionUser(projectInfos, element), false, this.context) +'"';
          });
        };

        runner.fileToTest = "" + TestTaskStore.getInstance().fileName;
        runner.methodToTest = "" + TestTaskStore.getInstance().selectedMethod;
        runner.targetToCover = "" + TestTaskStore.getInstance().targetPackage;

        runner.executableCli      = ConfigurationManager.getCliToUseForCompilation();

      }
    }

    return runner;
  }

}


export function registerExecuteTestPackageCommand(projectInfos: IProjectInfos, context: ExtensionContext) {
  return commands.registerCommand("dbFlux.executeTestPackage", async () => {

    if (projectInfos.isValid) {

      // check what file has to build
      let fileName = await getWorkingFile(context);
      let methodName = "";
      const editor = window.activeTextEditor!;
      const selection = editor.selection;
        if (selection && !selection.isEmpty) {

          const lineText = editor.document.getText(editor.document.lineAt(selection.active.line).range).trim().toLowerCase();
          const selectionRange = new Range(selection.start.line, selection.start.character, selection.end.line, selection.end.character);
          methodName = editor.document.getText(selectionRange);

          if (methodName.startsWith('procedure') || !lineText.startsWith('procedure') || methodName.includes(" ")) {
            methodName = "";
          }
        }

      // now check connection infos
      setAppPassword(projectInfos);


      if (CompileTaskStore.getInstance().appPwd !== undefined) {
        const insideTests = matchRuleShort(fileName, `*/${ConfigurationManager.getDBFolderName()}/*/tests/packages/*`);
        const fileExtension: string = "" + fileName.split('.').pop();
        const extensionAllowed = ConfigurationManager.getKnownSQLFileExtensions();


        if (extensionAllowed.map(ext => ext.toLowerCase()).includes(fileExtension.toLowerCase()) && (insideTests)) {
          which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
            TestTaskStore.getInstance().selectedSchemas = [ConfigurationManager.getDBFolderName() + "/" + getDBUserFromPath(fileName, projectInfos)];
            TestTaskStore.getInstance().fileName = fileName;
            TestTaskStore.getInstance().selectedMethod = methodName;

            context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new TestTaskProvider(context, "executeTestPackage")));
            commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: executeTestPackage");
          }).catch(() => {
            window.showErrorMessage(`dbFlux: No executable ${ConfigurationManager.getCliToUseForCompilation()} found on path!`);
          });
        } else {
          window.showWarningMessage('Current filetype is not supported by dbFlux ...');
        }
      }
    }
  });
}

export function registerExecuteTestPackageCommandWithCodeCoverage(projectInfos: IProjectInfos, context: ExtensionContext) {
  return commands.registerCommand("dbFlux.executeTestPackageWithCodeCoverage", async () => {

    if (projectInfos.isValid) {

      // check what file has to build
      let fileName = await getWorkingFile(context);

      // now check connection infos
      setAppPassword(projectInfos);

      if (CompileTaskStore.getInstance().appPwd !== undefined) {
        const insideTests = matchRuleShort(fileName, `*/${ConfigurationManager.getDBFolderName()}/*/tests/packages/*`);
        const fileExtension: string = "" + fileName.split('.').pop();
        const extensionAllowed = ConfigurationManager.getKnownSQLFileExtensions();


        if (extensionAllowed.map(ext => ext.toLowerCase()).includes(fileExtension.toLowerCase()) && (insideTests)) {
          which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
            TestTaskStore.getInstance().selectedSchemas = [ConfigurationManager.getDBFolderName() + "/" + getDBUserFromPath(fileName, projectInfos)];
            TestTaskStore.getInstance().fileName = fileName;
            TestTaskStore.getInstance().selectedMethod = "";
            TestTaskStore.getInstance().targetPackage = (await getTargetPackages())?.join('|');

            if (TestTaskStore.getInstance().targetPackage) {
              context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new TestTaskProvider(context, "executeTestPackageWithCodeCoverage")));
              commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: executeTestPackageWithCodeCoverage");
            }
          }).catch((e:any) => {
            window.showErrorMessage(`dbFlux: No executable ${ConfigurationManager.getCliToUseForCompilation()} found on path! ${e}`);
          });
        } else {
          window.showWarningMessage('Current filetype is not supported by dbFlux ...');
        }
      }
    }
  });
}


export function registerExecuteTestsTaskCommand(projectInfos: IProjectInfos, context: ExtensionContext) {
  return commands.registerCommand("dbFlux.executeTests", async () => {
    if (projectInfos.isValid) {
      setAppPassword(projectInfos);

      if (CompileTaskStore.getInstance().appPwd !== undefined) {

        let schemaSelected: boolean = false;
        const dbSchemaFolders = await getDBSchemaFolders();
        if (dbSchemaFolders.length > 1) {

          // preselect folders/schemas based on last choice
          const selectedFolders  = (context.workspaceState.get("dbFlux_last_tested_folders")!+"").split("|");
          dbSchemaFolders.forEach((v)=>{
            v.picked = selectedFolders.includes(v.description!);
          });

          const items: QuickPickItem[] | undefined = await window.showQuickPick(dbSchemaFolders, {
            canPickMany: true, placeHolder: 'Choose Schema to run your tests'
          });
          schemaSelected = (items !== undefined && items?.length > 0);
          TestTaskStore.getInstance().selectedSchemas = items?.map(function (element) { return element.description!; });
          // store choice for next use
          context.workspaceState.update("dbFlux_last_tested_folders", TestTaskStore.getInstance().selectedSchemas?.join("|"));
        } else if (dbSchemaFolders.length === 1) {
          schemaSelected = true;
          TestTaskStore.getInstance().selectedSchemas = dbSchemaFolders?.map(function (element) { return element.description!; });
        }

        if (schemaSelected) {
          which(ConfigurationManager.getCliToUseForCompilation()).then(async () => {
            context.subscriptions.push(tasks.registerTaskProvider("dbFlux", new TestTaskProvider(context, "executeTests")));
            await commands.executeCommand("workbench.action.tasks.runTask", "dbFlux: executeTests");
          }).catch((error: any) => {
            LoggingService.logError(error, error);
            window.showErrorMessage(`dbFlux: No executable ${ConfigurationManager.getCliToUseForCompilation()} found on path!`);
          });
        }
      }
    }
  });
}

async function testDashBoard(wsRoot:string, projectInfos: IProjectInfos, schemaName:string):Promise<string>{
  const fileName          = schemaName + "_test_junit.xml";
  const junitXmlFilePath  = path.join(wsRoot, 'tests/results/', fileName);
  const junitJsonFilePath = path.join(wsRoot, 'tests/results/', fileName.replace(".xml", ".json"));
  const htmlFile          = path.join(wsRoot, 'tests/results/', fileName.replace(".xml", ".html"));

  if (existsSync(junitXmlFilePath)) {

    const xmlData = readFileSync(junitXmlFilePath);
    const result = await parse(xmlData);

    writeFileSync(junitJsonFilePath, JSON.stringify(result, null, 2));

    const templateSource = readFileSync(path.resolve(__dirname, "..", "..", "dist", "templates", "junitreporter.tmpl.html").split(path.sep).join('/'), "utf8");

    Handlebars.registerHelper('json', function(context) {
        return JSON.stringify(context);
    });

    Handlebars.registerHelper('split', function(context) {
      let outputString = context.replace(/(ut\.expect.*?)\"/g, '$1,<br/><br/>');
      outputString = outputString.replace(/("Actual:)/g, '<br/>$1');
      outputString = outputString.replace(/(line\s[0-9]*\sut\.)/g, '<br/>$1');
      outputString = outputString.replace(/(ORA\-[0-9]*)/g, '<br/>$1');
      return outputString;
    });

    Handlebars.registerHelper('add', function(a, b) {
      return a + b;
    });

    Handlebars.registerHelper('resultClassName', function(error, failure) {
      if (error > 0 ) {
        return "Error";
      } else if (failure > 0 ) {
        return "Failure";
      } else {
        return "pass";
      };
    });

    Handlebars.registerHelper('resultName', function(error, failure) {
      if (error > 0 ) {
        return "Error";
      } else if (failure > 0 ) {
        return "Failure";
      } else {
        return "Success";
      };
    });


    const template = Handlebars.compile(templateSource);

    const reportData = {
      unit: result,
      report_title: "dbFlux - Test Results",
      project_name: projectInfos.projectName,
      project_mode: projectInfos.projectMode,
      report_schema: schemaName
    };

    const html = template(reportData);

    writeFileSync(htmlFile, html);
  }

  return htmlFile;
}

async function getAnsiHtmlFile(wsRoot:string, projectInfos: IProjectInfos, schemaName:string):Promise<string>{
  const fileName = schemaName + "_test_console.log";
  const logFile = path.join(wsRoot, "tests/results/", fileName);
  const htmlFile = logFile.replace(".log", ".html");

  if (existsSync(logFile)) {
    const logContent = readFileSync(logFile, "utf8");

    // const Convert = require('ansi-to-html');
    // const convert = new Convert({fg: '#FFF',
    //                             bg: '#222',
    //                             newline: true});

    // const htmlContent = convert.toHtml(logContent);

    const termToHtml = require('term-to-html');
    const htmlContent = termToHtml.strings(logContent, termToHtml.themes.dark.name);

    writeFileSync(htmlFile, htmlContent);
  }
  return htmlFile;
}

async function getCoverageHtmlFile(wsRoot:string, projectInfos: IProjectInfos, schemaName:string):Promise<string>{
  const fileName = schemaName + "_test_coverage.html";
  const htmlFile = path.join(wsRoot, "tests/results/", fileName);

  return htmlFile;
}

export async function openTestResult(context: ExtensionContext){
  const wsRoot = getWorkspaceRootPath();
  const projectInfos = await getProjectInfos(context);

  TestTaskStore.getInstance().selectedSchemas?.forEach(async element => {
    const schemaName = element.split('/')[1];
    const htmlFile = ConfigurationManager.getTestOutputFormat() === "ANSI Console"
                    ? await getAnsiHtmlFile(wsRoot, projectInfos, schemaName)
                    : await testDashBoard(wsRoot, projectInfos, schemaName);

    if ( existsSync(htmlFile)) {
      // Create and show panel
      const webViewTestPanel = window.createWebviewPanel(
        'dbFlux',
        'utPLSQL Output - ' + schemaName,
        ViewColumn.Beside,
        {}
      );

      webViewTestPanel.webview.html = readFileSync(htmlFile, "utf8");
    }
  });
  window.setStatusBarMessage(`Tests completed, Showing Output as Html`, 2000);
}

export async function openCoverageResult(context: ExtensionContext){
  const wsRoot = getWorkspaceRootPath();
  const projectInfos = await getProjectInfos(context);

  TestTaskStore.getInstance().selectedSchemas?.forEach(async element => {
    const schemaName = element.split('/')[1];
    const htmlFile = await getCoverageHtmlFile(wsRoot, projectInfos, schemaName);

    if ( existsSync(htmlFile)) {
      // Create and show panel
      const webViewTestPanel = window.createWebviewPanel(
        'dbFlux',
        'utPLSQL Output - ' + schemaName,
        ViewColumn.Beside,
        {enableScripts:true} // utPLSQL is referencing some js, css and images //FIXME: later
      );

      const htmlContent = readFileSync(htmlFile, "utf8");
      webViewTestPanel.webview.html = htmlContent;
    }
  });
  window.setStatusBarMessage(`Tests completed, Showing Output as Html`, 2000);
}

async function getTargetPackages(): Promise<string[] | undefined> {
  const dbSchemaFolders = await getDBSchemaFolders();
  const packages:QuickPickItem[] = [];
  for (const schema of dbSchemaFolders ) {
    const packageFiles = readdirSync(path.join(getWorkspaceRootPath(), ConfigurationManager.getDBFolderName(), schema.label, "sources", "packages"));

    packages.push(...packageFiles
                          .filter((pckName) => pckName.endsWith(".pkb"))
                          .map(function(elem){return {"label": elem, "description": schema.label}});
    );
  }
  const selectedPackages: QuickPickItem[] | undefined = await window.showQuickPick(packages, {
    title: 'Package(s) to measure coverage',
    placeHolder: 'Select one or more packages',
    canPickMany: true
  });

  const selectedPakagesWithSchemaeName = selectedPackages?.map(function(elem) {
    return elem.description+"."+elem.label.toLowerCase().replace(".pkb", "");
  });

  return selectedPakagesWithSchemaeName;
}
