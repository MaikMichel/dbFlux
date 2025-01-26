import { ExtensionContext, commands, tasks, window, workspace } from "vscode";
import { setAppPassword, CompileTaskStore } from "../stores/CompileTaskStore";
import { ExportTaskStore } from "../stores/ExportTaskStore";
import { getDBFlowMode, IProjectInfos } from "./AbstractBashTaskProvider";
import { ExportTaskProvider } from "./ExportTaskProvider";
import { getSchemaFromFile, getWorkspaceRootPath } from "../helper/utilities";
import { PathLike, readdirSync } from "fs";
import * as path from "path";
import { setEnvValue } from "../wizards/InitializeProjectWizard";
import { ConfigurationManager } from "../helper/ConfigurationManager";

export function registerSetSchemaPassword(projectInfos: IProjectInfos, context: ExtensionContext) {
  return commands.registerCommand("dbFlux.setSchemaPassword", async () => {


    if (projectInfos.isValid) {
      // Show all schemas and select one
      if (workspace.workspaceFolders) {
        const wsRoot = workspace.workspaceFolders[0].uri.fsPath;
        const sourceDB = path.join(wsRoot, ConfigurationManager.getDBFolderName());

        const getSchemaFolders = (source: PathLike) => readdirSync(source, { withFileTypes: true })
              .filter((dirent) => {
                return dirent.isDirectory() && !["_setup", ".setup", "dist", ".hooks"].includes(dirent.name);
              })
              .map((dirent) => dirent.name);

        const schemaFolder = await window.showQuickPick(getSchemaFolders(sourceDB), {placeHolder: "dbFlux: Select Schema"});

        if (schemaFolder) {
          // remove leading numbers with underscore
          const schema = schemaFolder.replace(/^[\d_]+/, '');

          // then enter password
          const schema_pwd = await window.showInputBox({ prompt: `dbFlux: Enter Password for connection ${schema}@${projectInfos.dbTns} - Leave blank to unset password `, placeHolder: "Password", password: true });

          // write password base on dbFlux-Mode
          const mode = getDBFlowMode(context)!

          // TODO: check mode to be valid first in this method
          if (mode === "dbFlow"){
            const file = path.join(wsRoot, "apply.env");
            setEnvValue(file, `DBFLOW_${schema}_PWD`, schema_pwd!);
          } else if (mode === "dbFlux"){
            if (schema_pwd === undefined || schema_pwd.length === 0) {
              context.workspaceState.update(`dbFlux_${schema}_PWD`, undefined)
              await context.secrets.delete(getWorkspaceRootPath() +`|dbFlux_${schema}_PWD`);
            } else {
              context.workspaceState.update(`dbFlux_${schema}_PWD`, 'secret')
              await context.secrets.store(getWorkspaceRootPath() +`|dbFlux_${schema}_PWD`, schema_pwd);
            }
          }

        } // schemaFolder

      }
    }
  });
};