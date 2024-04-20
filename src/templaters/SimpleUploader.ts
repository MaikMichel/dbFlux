import * as fs from "fs";
import * as path from "path";
import * as Handlebars from "handlebars";
import { getApplicationIdFromStaticPath, getTargetPathFromFileName } from "../helper/utilities";

export class SimpleUploader {
  private isFlexMode: boolean;

  constructor(isFlexMode: boolean){
    this.isFlexMode = isFlexMode;
  }

  async genFile(sourceFile:string) {
    const sourceContent = fs.readFileSync(sourceFile, {encoding: 'base64'});
    const uploadSQLFile = sourceFile + '.sql';
    const inAppID = getApplicationIdFromStaticPath(sourceFile, this.isFlexMode);
    const inFileName = getTargetPathFromFileName(inAppID, sourceFile);


    const template = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, "..", "..", "dist", "templates", "upload.tmpl.sql").split(path.sep).join('/'), "utf8"));
    const content = {
      "inAppID": inAppID,
      "files": [{
        "inFileName": inFileName,
        "inFileContent": sourceContent.match(/.{1,200}/g)
      }]
    };
    fs.writeFileSync(uploadSQLFile, template(content));
  }
}
