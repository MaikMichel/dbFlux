import * as fs from "fs";
import * as path from "path";
import * as Handlebars from "handlebars";
import { getApplicationIdFromPluginPath, getApplicationIdFromStaticPath, getPluginIDFromPath, getTargetPathFromFileName } from "../helper/utilities";

export class SimpleUploader {
  private isFlexMode: boolean;

  constructor(isFlexMode: boolean){
    this.isFlexMode = isFlexMode;
  }

  async genFile(sourceFile:string, pPlugin: boolean = false) {
    const sourceContent = fs.readFileSync(sourceFile, {encoding: 'base64'});
    const uploadSQLFile = sourceFile + '.sql';

    const inAppID = pPlugin?getApplicationIdFromPluginPath(sourceFile, this.isFlexMode):getApplicationIdFromStaticPath(sourceFile, this.isFlexMode);
    const pluginID = pPlugin?getPluginIDFromPath(inAppID, sourceFile, this.isFlexMode):undefined;
    const inFileName = getTargetPathFromFileName(inAppID, sourceFile, pluginID);


    const template = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, "..", "..", "dist", "templates", pPlugin?"upload.plugin.tmpl.sql":"upload.tmpl.sql").split(path.sep).join('/'), "utf8"));
    const content = {
      "inAppID": inAppID,
      "pluginID": pluginID,
      "files": [{
        "inFileName": inFileName,
        "inFileContent": sourceContent.match(/.{1,200}/g)
      }]
    };
    fs.writeFileSync(uploadSQLFile, template(content));
  }
}
