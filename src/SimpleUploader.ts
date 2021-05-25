import * as fs from "fs";
import * as path from "path";
import * as Handlebars from "handlebars";
import { getApplicationIdFromPath, getTargetPathFromFileName } from "./utilities";

export class SimpleUploader {
  private sourceContent: string;

  constructor(private sourceFile: string){
    this.sourceContent = fs.readFileSync(this.sourceFile, {encoding: 'base64'});
  }

  async genFile() {
    const uploadSQLFile = this.sourceFile + '.sql';
    const inAppID = getApplicationIdFromPath(this.sourceFile);
    const inFileName = getTargetPathFromFileName(inAppID, this.sourceFile);


    const template = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, "..", "dist", "upload.tmpl.sql").split(path.sep).join('/'), "utf8"));
    const content = {
      "inAppID": inAppID,
      "files": [{
        "inFileName": inFileName,
        "inFileContent": this.sourceContent.match(/.{1,200}/g)
      }]
    };
    fs.writeFileSync(uploadSQLFile, template(content));
  }
}
