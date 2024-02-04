import { Progress, window, workspace} from "vscode";
import * as path from "path";

// export enum LogLevel {
//   'INFO'    = 'INFO',
//   'WARNING' = 'WARNING',
//   'ERROR'   = 'ERROR'
// }

// export const outputLog = (text: string, show: boolean = false, level: LogLevel = LogLevel.INFO) => {
//   if (show) {
//     outputChannel.show();
//   }

//   const now       = new Date();
//   const timestamp = new Date((now).getTime() - now.getTimezoneOffset() * 60000).toISOString().replace(/(.*)T(.*)\..*/,'$1 $2')

//   outputChannel.appendLine(`${timestamp} [${level}] > ${text}`);
// };

// export const logWithProgressInfo = (text: string, mprogress?: Progress<{message: string}>) => {
//   outputLog(text, false, LogLevel.INFO);

//   mprogress?.report({ message: text})
// };


// export const logInfo = (text: string, show?: boolean) => {
//   outputLog(text, show, LogLevel.INFO);
// };


// export const logWarning = (text: string, show: boolean = false) => {
//   outputLog(text, show, LogLevel.WARNING);
// };

// export const logError = (text: string, show: boolean = false) => {
//   outputLog(text, show, LogLevel.ERROR);
// };



type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "NONE";

export abstract class LoggingService {
  private static outputChannel = window.createOutputChannel("dbFlux", "log");

  private static logLevel: LogLevel = workspace.getConfiguration("dbFlux").get("loggingMode") || "INFO"

  public setOutputLevel(newLogLevel: LogLevel) {
    LoggingService.logLevel = newLogLevel;
  }

  /**
   * Append messages to the output channel and format it with a title
   *
   * @param message The message to append to the output channel
   */
  public static logDebug(message: string, data?: unknown): void {
    if (
      LoggingService.logLevel === "NONE" ||
      LoggingService.logLevel === "INFO" ||
      LoggingService.logLevel === "WARN" ||
      LoggingService.logLevel === "ERROR"
    ) {
      return;
    }

    const myCaller = (new Error()).stack?.split("\n")[2].trim().split(" ")[1]
    const arr = myCaller?.split(path.sep);
    if (arr?.length && arr.length-1 ) {
      LoggingService.logMessage("<"+arr[arr.length-1] +"> " + message, "DEBUG");
    } else {
      LoggingService.logMessage("<"+myCaller +"> " + message, "DEBUG");
    }


    if (data) {
      LoggingService.logObject(data);
    }
  }

  /**
   * Append messages to the output channel and format it with a title
   *
   * @param message The message to append to the output channel
   */
  public static logInfo(message: string, data?: unknown, mprogress?: Progress<{message: string}>): void {
    if (
      LoggingService.logLevel === "NONE" ||
      LoggingService.logLevel === "WARN" ||
      LoggingService.logLevel === "ERROR"
    ) {
      return;
    }
    LoggingService.logMessage(message, "INFO");
    if (data) {
      LoggingService.logObject(data);
    }
    mprogress?.report({ message: message})
  }

  /**
   * Append messages to the output channel and format it with a title
   *
   * @param message The message to append to the output channel
   */
  public static logWarning(message: string, data?: unknown): void {
    if (LoggingService.logLevel === "NONE" || LoggingService.logLevel === "ERROR") {
      return;
    }
    LoggingService.logMessage(message, "WARN");
    if (data) {
      LoggingService.logObject(data);
    }
  }

  public static logError(message: string, error?: unknown) {
    if (LoggingService.logLevel === "NONE") {
      return;
    }
    LoggingService.logMessage(message, "ERROR");
    if (typeof error === "string") {
      // Errors as a string usually only happen with
      // plugins that don't return the expected error.
      LoggingService.outputChannel.appendLine(error);
    } else if (error instanceof Error) {
      if (error?.message) {
        LoggingService.logMessage(error.message, "ERROR");
      }
      if (error?.stack) {
        LoggingService.outputChannel.appendLine(error.stack);
      }
    } else if (error) {
      LoggingService.logObject(error);
    }
  }

  public static show() {
    LoggingService.outputChannel.show();
  }

  private static logObject(data: unknown): void {
    const message = JSON.stringify(data, null, 2);

    LoggingService.outputChannel.appendLine(message);
  }

  /**
   * Append messages to the output channel and format it with a title
   *
   * @param message The message to append to the output channel
   */
  private static logMessage(message: string, logLevel: LogLevel): void {
    const now       = new Date();
    const timestamp = new Date((now).getTime() - now.getTimezoneOffset() * 60000).toISOString().replace(/(.*)T(.*)\..*/,'$1 $2')

    LoggingService.outputChannel.appendLine(`${timestamp} - [${logLevel.padEnd(6, " ")}] > ${message}`);
  }
}
