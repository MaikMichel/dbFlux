import { ExtensionContext } from "vscode";
import { MultiStepInput } from "./InputFlowAction";

export async function addFeatureSet(context: ExtensionContext) {
  const title = 'Add FeatureSet to Project';

  interface State {
    title:      string;
    step:       number;
    totalSteps: number;

    gitUrl:     string;
  }

  function shouldResume() {
    // Could show a notification with the option to resume.
    return new Promise<boolean>((resolve, reject) => {
      // noop
    });
  }

  async function isURL(urlString :string) {
    try {
      new URL(urlString);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function validateValueIsRequieredAndURL(name: string) {
    return (name == undefined || name.length === 0) ? 'Value is required' : await isURL(name) ? undefined:'Value must be an URL';
  }

  async function collectInputs() {
    const state = {} as Partial<State>;

    await MultiStepInput.run(input => inputGitURL(input, state));
    return state as State;
  }

  async function inputGitURL(input: MultiStepInput, state: Partial<State>) {
    state.gitUrl = await input.showInputBox({
      title,
      step: 1,
      totalSteps: 1,
      value: state.gitUrl || '',
      prompt: 'Enter URL to a Git-Repo to use as submodule',
      validate: validateValueIsRequieredAndURL,
      shouldResume: shouldResume
    });
  }

  return await collectInputs();
}
