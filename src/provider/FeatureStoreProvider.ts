import { ExtensionContext, ProgressLocation, QuickPickItem, Uri, commands, window } from "vscode";
import { addFeatureSet } from "../wizards/AddFeatureSet";

import { KeyVal, compareVersions, execShell, getWorkspaceRootPath, isJSON, replaceKeysWithValues, rtrim } from "../helper/utilities";


import { copyFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import * as path from "path";
import { getDBSchemaFolders } from "./AbstractBashTaskProvider";
import { ensureDirSync } from "fs-extra";
import { dirname } from "path";
import { syncFeatureSet } from "../wizards/SyncFeatureSet";
import { LoggingService } from "../helper/LoggingService";

const featureCatalogFile = path.join(getWorkspaceRootPath(), ".featureCatalog")
const dbFlowModuleFolder = "./.featureSets"


interface Catalog {
  features: FeatureSet[]
}

interface FeatureSet {
  feature: string,
  version: string,
  replacers: Replacers[],
  instructions: Instruction[],
  state: string | undefined,
  folder: string | undefined,
  url: string | undefined
}

interface Instruction {
  file: string;
  target: string;
  written: string;
  initial: boolean;
  force: boolean;
}

interface Replacers {
  title: string;
  marker: string;
  type: string;
  assigned: string;
}


const parseToFeatureSet = (content: string): FeatureSet | undefined => {
  try {
    return JSON.parse(content)
  } catch (error) {
    LoggingService.logError("Error parsing content of manifest.json");
  }
}

const parseToCatalog = (content: string): Catalog | undefined => {
  try {
    return JSON.parse(content)
  } catch (error) {
  LoggingService.logError("Error parsing content of .featureCatalog");
  }
}

const writeCatalog = async (FeatureSet: FeatureSet, targetFolder: string, gitURL: string, existingIndex: number, Catalog: Catalog | undefined) => {
  FeatureSet.state = "ADDED";
  FeatureSet.folder = targetFolder;
  FeatureSet.url = gitURL;
  if (existingIndex !== -1) {
    LoggingService.logInfo("Replacing FeatureSet");
    Catalog!.features[existingIndex]! = FeatureSet;
  } else {
    LoggingService.logInfo("Adding FeatureSet");
    Catalog?.features.push(FeatureSet);
  }

  LoggingService.logInfo("Writing Catalog");
  writeFileSync(featureCatalogFile, Buffer.from(JSON.stringify(Catalog, null, 2)));
}

const updateCatalog = async (FeatureSet: FeatureSet, Catalog: Catalog | undefined, existingIndex: number) => {
  LoggingService.logInfo("Replacing FeatureSet");
  FeatureSet.state = "INSYNC";
  FeatureSet.folder = Catalog!.features[existingIndex]!.folder;
  FeatureSet.url = Catalog!.features[existingIndex]!.url;

  // replacers
  for (const replacer of FeatureSet.replacers) {
    const replInd = Catalog!.features[existingIndex]!.replacers.findIndex(item => item.title === replacer.title) || 0;
    if (replInd !== -1) {
      replacer.assigned = Catalog!.features[existingIndex]!.replacers[replInd].assigned;
    }
  }

  LoggingService.logInfo("Writing Catalog");
  Catalog!.features[existingIndex]! = FeatureSet;
  writeFileSync(featureCatalogFile, Buffer.from(JSON.stringify(Catalog, null, 2)));
}

const informWhenNewVersionExists = () => {
  // read catalog
  if (existsSync(featureCatalogFile)) {
    const Catalog = parseToCatalog(readFileSync(featureCatalogFile, "utf8"));

    // check feature versions
    for (const feature of Catalog!.features) {
      // read manifest
      const manifestFile = path.join(getWorkspaceRootPath(), dbFlowModuleFolder, feature.folder!, "manifest.json");
      if (existsSync(manifestFile)) {
        const manifestContent = readFileSync(manifestFile, { encoding: 'utf8' });
        if (isJSON(manifestContent)) {
          const FeatureSet = parseToFeatureSet(manifestContent);
          if (FeatureSet != undefined) {
            if (compareVersions(FeatureSet.version, feature.version!) === 1) {
              LoggingService.logInfo(`FeatureSet: ${FeatureSet.feature} is here with a new version ${FeatureSet.version}`);
              const commandString = "Sync FeatureSet"
              window.showInformationMessage(`dbFlux: FeatureSet: ${FeatureSet.feature} is here with a new version ${FeatureSet.version}`,
                commandString).then(selection => {
                  if (selection === commandString) {
                    LoggingService.logInfo(`Running Command to Sync Feature`);
                    commands.executeCommand('dbFlux.syncFeatureSet', feature.folder);
                  }
                })
            }
          }
        }
      }
    }
  }
}

const executeInstructions = async (catalog: Catalog, featureName: string) => {

  const fIndex = catalog.features.findIndex((fSet) => fSet.feature === featureName);
  const FeatureSet = catalog.features[fIndex];
  const replaceWith: KeyVal[] = [];

  if (FeatureSet.replacers) {

    for (const replacer of FeatureSet.replacers) {
      if (replacer.type === "SCHEMA" && !replacer.assigned) {
        const item: QuickPickItem | undefined = await window.showQuickPick(getDBSchemaFolders(), {
          canPickMany: false, placeHolder: replacer.title
        });
        replacer.assigned = item?.label!

        replaceWith.push({ key: replacer.marker, value: item?.label! });
      } else {
        replaceWith.push({ key: replacer.marker, value: replacer.assigned });
      }
    }

    LoggingService.logInfo("Replacers parsed");
  }


  // process instructions
  for (const instruction of FeatureSet.instructions) {
    const srcFile = path.join(getWorkspaceRootPath(), dbFlowModuleFolder, FeatureSet.folder!, instruction.file);
    const targetFile = path.join(getWorkspaceRootPath(), replaceKeysWithValues(instruction.target, replaceWith));
    ensureDirSync(dirname(targetFile));
    // copy when file not exists, initial is false or not set, force is true
    if (!existsSync(targetFile) || !instruction.initial || instruction.force) {
      LoggingService.logInfo(`Copy File ${srcFile} to ${targetFile}`);
      copyFileSync(srcFile, targetFile);
    }
    instruction.written = replaceKeysWithValues(instruction.target, replaceWith);
  }


  // Write Back to Catalog
  FeatureSet.state = "APPLIED";
  LoggingService.logInfo("Writing Catalog");
  writeFileSync(featureCatalogFile, Buffer.from(JSON.stringify(catalog, null, 2)));
}




const showFinishMessage = async (FeatureSet: FeatureSet) => {
  const chlgFile = path.join(getWorkspaceRootPath(), dbFlowModuleFolder, FeatureSet.folder!, "changelog.md");
  const showChangeLog = existsSync(chlgFile) ? "Show Changelog?" : "";

  const readmeFile = path.join(getWorkspaceRootPath(), dbFlowModuleFolder, FeatureSet.folder!, "readme.md");
  const showReadme = existsSync(readmeFile) ? "Show Readme?" : "";


  window.showInformationMessage("FeatureSet written to your project",
    showChangeLog, showReadme).then(selection => {
      if (selection === "Show Changelog?") {
        let uri = Uri.file(chlgFile);
        commands.executeCommand('markdown.showPreview', uri);
      } else if (selection === "Show Readme?") {
        let uri = Uri.file(readmeFile);
        commands.executeCommand('markdown.showPreview', uri);
      }
    });
}

export function registerAddFeatureSet(command: string, context: ExtensionContext) {
  informWhenNewVersionExists();

  return commands.registerCommand(command, async () => {
    // let user enter URL
    const state = await addFeatureSet(context);
    if (!state) return;

    // parse return
    const gitURL = rtrim(state.gitUrl, '/')
    const parts = gitURL.split('/');
    const targetFolder = rtrim(parts[parts.length - 1], '.git');

    window.withProgress({
      title: 'Please wait...',
      location: ProgressLocation.Notification,
      cancellable: false
    },
      async (progress) => {
        let myCommand = `git submodule add --force ${state.gitUrl} ${dbFlowModuleFolder}/${targetFolder}`;
        progress.report({ message: "Adding SubModule" });
        try {
          await execShell(myCommand, `Adding SubModule: ${state.gitUrl}`);
        } catch (e: any) {
          LoggingService.logError(e, e);
          window.showErrorMessage("There was an error when trying to add your input as Git-SubModule!");
          return
        }


        myCommand = `git pull`;
        progress.report({ message: "Update SubModule" });
        await execShell(myCommand, `Updating SubModule: ${state.gitUrl}`, `${dbFlowModuleFolder}/${targetFolder}`);

        LoggingService.logInfo("Validate manifest", null, progress);
        const manifestFile = path.join(getWorkspaceRootPath(), dbFlowModuleFolder, targetFolder, "manifest.json");
        if (!existsSync(manifestFile)) {
          LoggingService.logError("Repository has no manifest.json defined!");
          window.showWarningMessage("Repository has no manifest.json defined!");
          return;
        }

        const manifestContent = readFileSync(manifestFile, { encoding: 'utf8' });
        if (!isJSON(manifestContent)) {
          LoggingService.logError("manifest.json is not of JSON format");
          window.showErrorMessage("manifest.json is not of JSON format");
          return;
        }

        LoggingService.logInfo("Parsing FeatureSet", null, progress);
        const FeatureSet = parseToFeatureSet(manifestContent);
        if (!FeatureSet) {
          LoggingService.logError(`Unknown structure in ${manifestFile}`);
          window.showWarningMessage(`Unknown structure in ${manifestFile}`);
          return;
        }


        LoggingService.logInfo("Reading Catalog", null, progress);
        const Catalog = parseToCatalog(existsSync(featureCatalogFile) ? readFileSync(featureCatalogFile, "utf8")
          : `{
                                                                    "features": [
                                                                    ]
                                                                  }`);

        LoggingService.logInfo("Searching FeatureSet in catalog", null, progress);
        const existingIndex = Catalog?.features.findIndex(item => item.feature === FeatureSet.feature) || 0;

        LoggingService.logInfo("Writing catalog", null, progress);
        await writeCatalog(FeatureSet, targetFolder, gitURL, existingIndex, Catalog);

        LoggingService.logInfo("Executing instructions", null, progress);
        await executeInstructions(Catalog!, FeatureSet.feature);

        LoggingService.logInfo("Done", null, progress);
        await showFinishMessage(FeatureSet);
      });
  })
}


export function registerSyncFeatureSet(command: string, context: ExtensionContext) {

  return commands.registerCommand(command, async (fFolder: string) => {

    window.withProgress({
      title: 'Please wait...',
      location: ProgressLocation.Notification,
      cancellable: false
    },
      async (progress) => {
        // progress.report({ message: "Defining targetFolder"});

        // get FolderName (param or ask for it)
        const folderName = fFolder ? dbFlowModuleFolder + "/" + fFolder : (await syncFeatureSet(context, dbFlowModuleFolder))?.featureFolder.description;
        if (!folderName) return;

        // read or create Catalog
        LoggingService.logInfo("Reading Catalog", null, progress);
        const Catalog = parseToCatalog(existsSync(featureCatalogFile) ? readFileSync(featureCatalogFile, "utf8")
          : `{
                                                                    "features": [
                                                                    ]
                                                                  }`);


        LoggingService.logInfo("Validate manifest", null, progress);
        const manifestFile = path.join(getWorkspaceRootPath(), folderName, "manifest.json");
        if (!existsSync(manifestFile)) {
          LoggingService.logError("Repository has no manifest.json defined!");
          window.showWarningMessage("Repository has no manifest.json defined!");
          return;
        }

        const manifestContent = readFileSync(manifestFile, { encoding: 'utf8' });
        if (!isJSON(manifestContent)) {
          LoggingService.logError("manifest.json is not of JSON format");
          window.showErrorMessage("manifest.json is not of JSON format");
          return;
        }

        LoggingService.logInfo("Parsing FeatureSet", null, progress);
        const FeatureSet = parseToFeatureSet(manifestContent);
        if (!FeatureSet) {
          LoggingService.logError(`Unknown structure in ${manifestFile}`);
          window.showWarningMessage(`Unknown structure in ${manifestFile}`);
          return;
        }

        LoggingService.logInfo("Searching FeatureSet in catalog", null, progress);
        const existingIndex = Catalog?.features.findIndex(item => item.feature === FeatureSet.feature) || 0;
        if (existingIndex === -1) {
          LoggingService.logError("FeatureSet not in catalog");
          window.showErrorMessage("FeatureSet not in catalog");
          return;
        }

        LoggingService.logInfo("Update catalog", null, progress);
        await updateCatalog(FeatureSet, Catalog, existingIndex);

        LoggingService.logInfo("Executing instructions", null, progress);
        await executeInstructions(Catalog!, FeatureSet.feature);

        LoggingService.logInfo("Done", null, progress);
        await showFinishMessage(FeatureSet);
      });

  });
}
