/* eslint-disable @typescript-eslint/naming-convention */

import { QuickPickItem, ExtensionContext, Uri, workspace, commands} from 'vscode';
import * as path from "path";
import { existsSync, PathLike, readdirSync } from 'fs';
import { MultiStepInput } from './InputFlowAction';
import { ConfigurationManager } from '../helper/ConfigurationManager';


export async function revealItemWizard(context: ExtensionContext) {

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

  const title = 'Select folder';



  async function pickObjectType(input: MultiStepInput, state: Partial<State>) {
    const objectTypes = await getAvailableObjectTypes();
    state.objectType = await input.showQuickPick({
      title,
      step: 1,
      totalSteps: 1,
      placeholder: 'Fuzzy filter ...',
      items: objectTypes,
      activeItem: objectTypes[0],
      shouldResume: shouldResume,
      canSelectMany: false
    });
  }


  function shouldResume() {
    // Could show a notification with the option to resume.
    return new Promise<boolean>((resolve, reject) => {
      // noop
    });
  }


  function subDirExists(dir: string):boolean {
    const files = readdirSync(dir, { withFileTypes: true });
    for (let i = 0; i < files.length; i++) {
      if (files[i].isDirectory()) {
        return true;
      }
    }
    return false;
  }

  function *walkSync(dir:string):any {
    if (existsSync(dir)) {
      const files = readdirSync(dir, { withFileTypes: true });
      for (let i = 0; i < files.length; i++) {
        if (files[i].isDirectory() && files[i].name !== "dist") {
          // check if there is any subdir in filder
          yield path.join(dir, files[i].name);
          if (subDirExists(path.join(dir, files[i].name))){
            yield* walkSync(path.join(dir, files[i].name));
          }
        }
      }
    }
  }

  function toFlatPropertyMap(obj: object, keySeparator = '/') {
    const flattenRecursive = (obj: object, parentProperty?: string, propertyMap: Record<string, unknown> = {}) => {
      for(const [key, value] of Object.entries(obj)){
        const property = parentProperty ? `${parentProperty}${keySeparator}${key}` : key;
        if(value && typeof value === 'object'){
          flattenRecursive(value, property, propertyMap);
        } else {
          propertyMap[property] = value;
        }
      }
      return propertyMap;
    };
    return flattenRecursive(obj);
  }

  async function getAvailableObjectTypes(): Promise<QuickPickItem[]> {
    if (workspace.workspaceFolders){
      let folders:string[] = [];

      const wsRoot = workspace.workspaceFolders[0].uri.fsPath;
      const sourceDB      = path.join(wsRoot, ConfigurationManager.getDBFolderName());
      const sourceStatic  = path.join(wsRoot, "static");
      const sourceReports = path.join(wsRoot, "reports");
      const sourceRest    = path.join(wsRoot, "rest");
      const sourceApex    = path.join(wsRoot, "apex");

      const getSchemaFolders = (source: PathLike) =>
          readdirSync(source, { withFileTypes: true })
          .filter((dirent) => {
            return dirent.isDirectory() && !["_setup", ".setup", "dist", ".hooks"].includes(dirent.name);
          })
          .map((dirent) => path.join(source.toString(), dirent.name));

      for (let schemaPath of [ ... getSchemaFolders(sourceDB)]) {
        // real file path
        for (let folderItem of walkSync(schemaPath)) {
          const folderString = (folderItem as string);
          if (folderString.includes("tables" + path.sep + "tables_ddl")) {
            folders.push(folderString.replace(wsRoot + path.sep, '').replace(/\\/g, '/').replace("tables/tables_ddl", "tables"));
          }
          folders.push(folderString.replace(wsRoot + path.sep, '').replace(/\\/g, '/'));
        }
      }

      if (existsSync(sourceStatic)) {
        for (let schemaPath of [ ... getSchemaFolders(sourceStatic)]) {
          for (let folderItem of walkSync(schemaPath)) {
            folders.push((folderItem as string).replace(wsRoot + path.sep, '').replace(/\\/g, '/'));
          }
        }
      }


      if (existsSync(sourceReports)) {
        for (let folderItem of walkSync(sourceReports)) {
          folders.push((folderItem as string).replace(wsRoot + path.sep, '').replace(/\\/g, '/'));
        }
      }

      if (existsSync(sourceApex)) {
        for (let folderItem of walkSync(sourceApex)) {
          folders.push((folderItem as string).replace(wsRoot + path.sep, '').replace(/\\/g, '/'));
        }
      }

      if (existsSync(sourceRest)) {
        for (let folderItem of walkSync(sourceRest)) {
          folders.push((folderItem as string).replace(wsRoot + path.sep, '').replace(/\\/g, '/'));
        }
      }

      const uniqueFolders = [...new Set(folders)];
      const folderNames = uniqueFolders.map(function(element){return {"label":element, "description": path.parse(element).name, "alwaysShow": false};});

      return folderNames;
    }

    return [{label: ""}];
  }


  // starting point
  const state = await collectInputs();


  if (state.objectType.label && workspace.workspaceFolders) {
    await commands.executeCommand('revealInExplorer', Uri.file(path.join(workspace.workspaceFolders[0].uri.fsPath, state.objectType.label)));
  }
}
