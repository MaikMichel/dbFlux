import { minify } from "terser";
import * as fs from "fs";
import * as path from "path";
import * as Handlebars from "handlebars";

export class Terserer {
  private sourceContent: string;
  constructor(private sourceFile: string){
    this.sourceContent = fs.readFileSync(this.sourceFile, "utf8");
  }


  async genFile() {
    var result = await minify(this.sourceContent, { sourceMap: true });

    if (result.code !== undefined && result.map !== undefined) {
      const uploadSQLFile = this.sourceFile + '.sql';
      const inAppID = getApplicationIdFromPath(this.sourceFile);
      const inFileName = getTargetPathFromFileName(inAppID, this.sourceFile);
      const inFileNameMin = changeExtension(inFileName, 'min.js');
      const inFileNameMap = changeExtension(inFileName, 'js.map');



      const template = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, "..", "dist", "upload.tmpl.sql").split(path.sep).join('/'), "utf8"));
      const content = {
        "inAppID": inAppID,
        "files": [  {
                      "inFileName": inFileName,
                      "inFileContent": Buffer.from(this.sourceContent, 'utf8').toString('base64').match(/.{1,200}/g),
                    },
                    {
                      "inFileName": inFileNameMin,
                      "inFileContent" : Buffer.from(result.code, 'utf8').toString('base64').match(/.{1,200}/g),
                    },
                    {
                      "inFileName" : inFileNameMap,
                      "inFileContent" : Buffer.from(result.map?.toString()!, 'utf8').toString('base64').match(/.{1,200}/g)
                    }
                 ]
      };
      console.log('DDD', template(content));
      fs.writeFileSync(uploadSQLFile, template(content));
    } else {
      console.log('nothing to upload');
    }
  }

}

export function changeExtension(filename: string, extension: string): string {
  let ext: string = path.extname(filename);
  let root: string = filename.substring(0, filename.length - ext.length);

  ext = extension.startsWith('.') ? extension : extension.length > 0 ? `.${extension}` : '';
  return `${root}${ext}`;
}

function getApplicationIdFromPath(sourceFile: string) {
  return sourceFile.split('static/f')[1].split('/src/')[0];
}
function getTargetPathFromFileName(inAppID: string, sourceFile: string) {
  return sourceFile.split('static/f'+inAppID+'/src/')[1];
}
