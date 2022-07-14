import { ExtensionContext, QuickPickItem } from "vscode";
import { getDBSchemaFolders } from "../provider/AbstractBashTaskProvider";
import { MultiStepInput } from "./InputFlowAction";

export interface ExportSchemaWizardState {
  title: string;
  step: number;
  totalSteps: number;

  schemaName: QuickPickItem;
  // finalConfirm: string;
  newSchemaName:string;
}

export async function exportSchemaWizard(context: ExtensionContext):Promise<ExportSchemaWizardState> {
  const title = 'dbFLux: Export Schema to Filesystem';

  async function collectInputs() {
    const state = {} as Partial<ExportSchemaWizardState>;

    await MultiStepInput.run(input => pickSchemaFromList(input, state));
    return state as ExportSchemaWizardState;
  }

  function shouldResume() {
    // Could show a notification with the option to resume.
    return new Promise<boolean>((resolve, reject) => {
      // noop
    });
  }

  async function pickSchemaFromList(input: MultiStepInput, state: Partial<ExportSchemaWizardState>) {
    const schemaFolders = (await getDBSchemaFolders())
    state.schemaName = await input.showQuickPick({
      title,
      step: 1,
      totalSteps: 2,
      placeholder: 'Pick a Schema',
      items: schemaFolders,
      activeItem: schemaFolders[0],
      shouldResume: shouldResume,
      canSelectMany: false
    });

    return (input: MultiStepInput) => pickConfirmation(input, state);
  }

  async function pickConfirmation(input: MultiStepInput, state: Partial<ExportSchemaWizardState>) {
    state.newSchemaName = await input.showInputBox({
      title,
      step: 2,
      totalSteps: 2,
      value: state.schemaName?.label || '',
      prompt: 'Enter target schema (All files will be overwritten)',
      validate: validateValueIsRequiered,
      shouldResume: shouldResume
    });
  }

  async function validateValueIsRequiered(name: string) {
    // eslint-disable-next-line eqeqeq
    return (name == undefined || name.length === 0) ? 'Value is required' : undefined;
  }

  return await collectInputs();
}

export async function exportObjectWizard(context: ExtensionContext, schema:string):Promise<ExportSchemaWizardState> {
  const title = 'dbFLux: Export Object to Filesystem';

  async function collectInputs() {
    const state = {} as Partial<ExportSchemaWizardState>;
    state.schemaName = {label:schema};

    await MultiStepInput.run(input => pickTargetSchema(input, state));
    return state as ExportSchemaWizardState;
  }

  function shouldResume() {
    // Could show a notification with the option to resume.
    return new Promise<boolean>((resolve, reject) => {
      // noop
    });
  }

  async function pickTargetSchema(input: MultiStepInput, state: Partial<ExportSchemaWizardState>) {
    state.newSchemaName = await input.showInputBox({
      title,
      step: 1,
      totalSteps: 1,
      value: state.schemaName?.label || '',
      prompt: 'Enter target schema (All files will be overwritten)',
      validate: validateValueIsRequiered,
      shouldResume: shouldResume
    });
  }

  async function validateValueIsRequiered(name: string) {
    // eslint-disable-next-line eqeqeq
    return (name == undefined || name.length === 0) ? 'Value is required' : undefined;
  }

  return await collectInputs();
}