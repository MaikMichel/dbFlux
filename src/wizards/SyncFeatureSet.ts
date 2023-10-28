import { ExtensionContext, QuickPickItem, workspace } from "vscode";
import { MultiStepInput } from "./InputFlowAction";
import * as path from "path";
import { PathLike, readdirSync } from "fs";

export async function syncFeatureSet(context: ExtensionContext, featurFolder: string) {
  const title = 'Sync FeatureSet to Project';

  interface State {
    title:      string;
    step:       number;
    totalSteps: number;

    featureFolder: QuickPickItem;
  }

  function shouldResume() {
    return new Promise<boolean>((resolve, reject) => {
      // noop
    });
  }

  async function collectInputs() {
    const state = {} as Partial<State>;

    await MultiStepInput.run(input => pickFeatureFromList(input, state));
    return state as State;
  }

  async function pickFeatureFromList(input: MultiStepInput, state: Partial<State>) {
    const schemaFolders = (await getFeatureFolders(featurFolder))
    state.featureFolder = await input.showQuickPick({
      title,
      step: 1,
      totalSteps: 1,
      placeholder: 'Pick a FeatureSet',
      items: schemaFolders,
      activeItem: schemaFolders[0],
      shouldResume: shouldResume,
      canSelectMany: false
    });
  }

  return await collectInputs();
}


const getFolders = (source: PathLike, excludes: string[] | undefined) =>
  readdirSync(source, { withFileTypes: true }).filter((dirent) => {
    return dirent.isDirectory() && !excludes?.includes(dirent.name);
  }).map((dirent) => dirent.name);

async function getFeatureFolders(folder:string):Promise<QuickPickItem[]> {
  if (workspace.workspaceFolders){
      const wsRoot = workspace.workspaceFolders[0].uri.fsPath;
      const sourceDB = path.join(wsRoot, folder);

      return getFolders(sourceDB, []).map(function(element){return {"label":element, "description":folder+"/"+element , "alwaysShow": true};});

  }
  return [{label: "", description:""}];
}