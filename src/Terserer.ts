import { minify } from "terser";
import * as fs from "fs";
import * as path from "path";
import * as Handlebars from "handlebars";
import { ConfigurationManager } from "./ConfigurationManager";
import { changeExtension, getApplicationIdFromPath, getTargetPathFromFileName } from "./utilities";

export class Terserer {
  private sourceContent: string;
  constructor(private sourceFile: string){
    this.sourceContent = fs.readFileSync(this.sourceFile, "utf8");
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
          "inFileContent": Buffer.from(this.sourceContent, 'utf8').toString('base64').match(/.{1,200}/g),
      }]
    };

    if (ConfigurationManager.getCreateAndUploadJavaScriptMinifiedVersion()) {
      var result = await minify(this.sourceContent, { sourceMap: ConfigurationManager.getCreateAndUploadJavaScriptSourceMap() });

      if (result.code !== undefined) {
        const inFileNameMin = changeExtension(inFileName, 'min.js');
        content.files.push({
          "inFileName": inFileNameMin,
          "inFileContent" : Buffer.from(result.code, 'utf8').toString('base64').match(/.{1,200}/g),
        });


        if (ConfigurationManager.getCreateAndUploadJavaScriptSourceMap() && result.map !== undefined) {
          const inFileNameMap = changeExtension(inFileName, 'js.map');
          content.files.push({
            "inFileName" : inFileNameMap,
            "inFileContent" : Buffer.from(result.map?.toString()!, 'utf8').toString('base64').match(/.{1,200}/g)
          });
        }
      }
    }

    fs.writeFileSync(uploadSQLFile, template(content));
  }
}
