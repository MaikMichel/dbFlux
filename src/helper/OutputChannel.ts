import { Progress, window} from "vscode";

let outputChannel = window.createOutputChannel("dbFlux");

export enum LogLevel {
  'INFO'    = 'INFO',
  'WARNING' = 'WARNING',
  'ERROR'   = 'ERROR'
}

export const outputLog = (text: string, show: boolean = false, level: LogLevel = LogLevel.INFO) => {
  if (show) {
    outputChannel.show();
  }

  const now       = new Date();
  const timestamp = new Date((now).getTime() - now.getTimezoneOffset() * 60000).toISOString().replace(/(.*)T(.*)\..*/,'$1 $2')

  outputChannel.appendLine(`${timestamp} [${level}] > ${text}`);
};

export const logWithProgressInfo = (text: string, mprogress?: Progress<{message: string}>) => {
  outputLog(text, false, LogLevel.INFO);

  mprogress?.report({ message: text})
};


export const logInfo = (text: string, show?: boolean) => {
  outputLog(text, show, LogLevel.INFO);
};


export const logWarning = (text: string, show: boolean = false) => {
  outputLog(text, show, LogLevel.WARNING);
};

export const logError = (text: string, show: boolean = false) => {
  outputLog(text, show, LogLevel.ERROR);
};
