import * as path from "path";
import * as Handlebars from "handlebars";
import * as vscode from "vscode";
import { workspace } from "vscode";
import { existsSync, PathLike, readdirSync, readFileSync, renameSync, writeFileSync } from "fs";

export class ReportTemplater {
  private sourceContent: string;
  private templateContent: string;

  constructor(private sourceFile: string){

    if (!existsSync(path.resolve(path.dirname(this.sourceFile), "template.sql"))) {
      vscode.window.showErrorMessage(`No template found in folder ${path.dirname(this.sourceFile)}`);
      throw new Error("No template found");
    }

    this.sourceContent = readFileSync(this.sourceFile, {encoding: 'base64'});
    this.templateContent = readFileSync(path.resolve(path.dirname(this.sourceFile), "template.sql").split(path.sep).join(path.posix.sep), {encoding: "utf8"});
  }



  async genFile() {
    if (this.sourceContent) {
      let sourceFileName = await vscode.window.showInputBox({value: path.basename(this.sourceFile)+`_${new Date().toISOString().slice(0, 10)}.sql`, prompt:"Enter new filename"});

      if (sourceFileName === undefined) {
        vscode.window.showErrorMessage('Action canceled');
      } else {


        const uploadSQLFile = path.join(path.dirname(this.sourceFile), sourceFileName);
        const inFileName = path.basename(this.sourceFile);


        const template = Handlebars.compile(readFileSync(path.resolve(__dirname, "..", "..", "dist", "templates", "report.tmpl.sql").split(path.sep).join(path.posix.sep), "utf8"));
        const content = {
          "inFileName": inFileName,
          "inFileContent": this.sourceContent.match(/.{1,200}/g),
          "uploadTemplate": this.templateContent
        };

        writeFileSync(uploadSQLFile, template(content));

        const currentWorkSpace = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(this.sourceFile));

        if (!currentWorkSpace) {
          vscode.window.showErrorMessage('There is no workspacefolder open.');
          throw new Error("There is no workspacefolder open.");
        }


        if (workspace.workspaceFolders) {
          let folders:string[] = [];
          const wsRoot = workspace.workspaceFolders[0].uri.fsPath;
          const sourceDB = path.join(wsRoot, "db");

          const getSchemaFolders = (source: PathLike) =>
          readdirSync(source, { withFileTypes: true })
                .filter((dirent) => {
                  return dirent.isDirectory() && !["_setup", ".setup", "dist", ".hooks"].includes(dirent.name);
                })
                .map((dirent) => path.join(source.toString(), dirent.name));

          for (let schemaPath of [ ... getSchemaFolders(sourceDB)]) {
            // real file path
            for (let folderItem of walkSync(schemaPath)) {
              const folderString = (folderItem as string);
              if (folderString.includes("tables" + path.sep + "tables_ddl")) {
                folders.push(folderString.replace(wsRoot + path.sep, '').replace(/\\/g, '/').replace("tables/tables_ddl", "tables"));
              }
              folders.push(folderString.replace(wsRoot + path.sep, '').replace(/\\/g, '/'));
            }
          }
          const folder = await vscode.window.showQuickPick(folders, {placeHolder:"Fuzzy pick a folder"});

          let newFile = uploadSQLFile;
          if (folder !== undefined) {
            newFile = path.join(wsRoot, folder, path.basename(uploadSQLFile));

            renameSync(uploadSQLFile, newFile);
          }

          vscode.window.showInformationMessage('File created @' + newFile);
          vscode.window.showTextDocument(vscode.Uri.file(newFile));

        }

      }
    }
  }
}



function *walkSync(dir:string):any {
  if (existsSync(dir)) {
    const files = readdirSync(dir, { withFileTypes: true });
    for (let i = 0; i < files.length; i++) {
      if (files[i].isDirectory() && files[i].name !== "dist") {
        // check if there is any subdir in filder
        if (subDirExists(path.join(dir, files[i].name))){
          yield* walkSync(path.join(dir, files[i].name));
        } else {
          yield path.join(dir, files[i].name);
        }
      }
    }
  }
}

function subDirExists(dir: string):boolean {
  const files = readdirSync(dir, { withFileTypes: true });
  for (let i = 0; i < files.length; i++) {
    if (files[i].isDirectory()) {
      return true;
    }
  }
  return false;
}