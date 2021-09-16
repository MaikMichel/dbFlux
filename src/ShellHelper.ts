import { spawn } from "child_process";
import { outputLog } from "./OutputChannel";


export class ShellHelper {
  public static execScript(script: string, executePath: string, envObject: any): Promise<{ status: boolean; result: string }> {
    return new Promise((resolve, reject) => {
      let retObj: any = {};
      try {
        const childProcess = spawn(script, [], {
          cwd: executePath,
          shell: true,
          env: envObject,
          stdio: ["inherit", null, null],
        });

        childProcess.stdout.on("data", function (data) {
          if (data.toString().trim() !== "") {
           outputLog(data.toString().trim());
          }
        });

        childProcess.stderr.on("data", function (data) {
          if (data.toString().trim() !== "") {
            retObj.status = false;
            retObj.result = "";
            outputLog(data.toString().trim());
          }
        });

        childProcess.on("close", function (code) {
          retObj.status = true;
          resolve(retObj);
        });
      } catch (err) {
        outputLog(executePath);
        console.error(err);
        retObj.status = false;
        retObj.result = "";
        resolve(retObj);
      }
    });
  }
}
