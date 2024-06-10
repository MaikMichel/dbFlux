import { minify } from "terser";
import * as fs from "fs";
import * as path from "path";
import * as Handlebars from "handlebars";
import { ConfigurationManager } from "../helper/ConfigurationManager";
import { changeExtension, getApplicationIdFromPluginPath, getApplicationIdFromStaticPath, getPluginIDFromPath, getTargetPathFromFileName } from "../helper/utilities";

export class Terserer {
  private sourceContent: string;
  private lastErrorMessage: string = "";
  private isFlexMode: boolean;
  constructor(private sourceFile: string, isFlexMode: boolean){
    this.sourceContent = fs.readFileSync(this.sourceFile, "utf8");
    this.isFlexMode = isFlexMode;
  }


  async genFile(pPlugin: boolean = false):Promise<boolean|undefined> {

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

    if (ConfigurationManager.getCreateAndUploadJavaScriptMinifiedVersion()) {
      try {
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

        fs.writeFileSync(uploadSQLFile, template(content));

        return Promise.resolve(true);

      } catch (error:any) {
        const { message } = error;

        console.error("dbFlux/terser: " + message);
        this.lastErrorMessage = message;
        return Promise.resolve(false);


      }

    }

  }

  getLastErrorMessage() {
    return this.lastErrorMessage;
  }
}
