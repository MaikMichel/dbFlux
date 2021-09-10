import { window } from "vscode";

let { createOutputChannel } = window;
let outputChannel = createOutputChannel("dbFlux");

export const outputLog = (text: string, show: boolean = false) => {
  if (show) {
    outputChannel.show();
  }

  outputChannel.appendLine(`[${new Date().toISOString()}] > ${text}`);
};