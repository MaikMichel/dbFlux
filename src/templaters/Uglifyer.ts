const uglifycss = require("uglifycss");
import * as fs from "fs";
import * as path from "path";
import * as Handlebars from "handlebars";
import { changeExtension, getApplicationIdFromPluginPath, getApplicationIdFromStaticPath, getPluginIDFromPath, getTargetPathFromFileName } from "../helper/utilities";
import { ConfigurationManager } from "../helper/ConfigurationManager";

export class Uglifyer {
  private sourceContent: string;
  private isFlexMode: boolean;
  constructor(private sourceFile: string, isFlexMode: boolean){
    this.sourceContent = fs.readFileSync(this.sourceFile, "utf8");
    this.isFlexMode = isFlexMode;
  }


  async genFile(pPlugin: boolean = false) {
    const uploadSQLFile = this.sourceFile + '.sql';
    const inAppID = pPlugin?getApplicationIdFromPluginPath(this.sourceFile, this.isFlexMode):getApplicationIdFromStaticPath(this.sourceFile, this.isFlexMode);
    const pluginID = pPlugin?getPluginIDFromPath(inAppID, this.sourceFile, this.isFlexMode):undefined;
    const inFileName = getTargetPathFromFileName(inAppID, this.sourceFile, pluginID);


    const template = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, "..", "..", "dist", "templates", pPlugin?"upload.plugin.tmpl.sql":"upload.tmpl.sql").split(path.sep).join('/'), "utf8"));
    const content = {
      "inAppID": inAppID,
      "pluginID": pluginID,
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
