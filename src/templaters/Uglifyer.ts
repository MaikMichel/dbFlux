const uglifycss = require("uglifycss");
import * as fs from "fs";
import * as path from "path";
import * as Handlebars from "handlebars";
import { changeExtension, getApplicationIdFromPath, getTargetPathFromFileName } from "../helper/utilities";
import { ConfigurationManager } from "../helper/ConfigurationManager";

export class Uglifyer {
  private sourceContent: string;
  private isFlexMode: boolean;
  constructor(private sourceFile: string, isFlexMode: boolean){
    this.sourceContent = fs.readFileSync(this.sourceFile, "utf8");
    this.isFlexMode = isFlexMode;
  }


  async genFile() {
    const uploadSQLFile = this.sourceFile + '.sql';
    const inAppID = getApplicationIdFromPath(this.sourceFile, this.isFlexMode);
    const inFileName = getTargetPathFromFileName(inAppID, this.sourceFile);


    const template = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, "..", "..", "dist", "upload.tmpl.sql").split(path.sep).join('/'), "utf8"));
    const content = {
      "inAppID": inAppID,
      "files": [{
        "inFileName": inFileName,
        "inFileContent": Buffer.from(this.sourceContent, 'utf8').toString('base64').match(/.{1,200}/g),
      }]
    };

    if (ConfigurationManager.getCreateAndUploadCSSMinifiedVersion()) {

      var result = await uglifycss.processString(this.sourceContent, {  });

      if (result !== undefined) {
        const inFileNameMin = changeExtension(inFileName, 'min.css');
        content.files.push({
          "inFileName": inFileNameMin,
          "inFileContent" : Buffer.from(result, 'utf8').toString('base64').match(/.{1,200}/g),
        });
      };
    }

    fs.writeFileSync(uploadSQLFile, template(content));
  }
}
