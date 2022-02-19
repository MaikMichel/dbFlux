import * as fs from "fs";
import * as path from "path";
import * as Handlebars from "handlebars";
import * as vscode from "vscode";

export class ReportTemplater {
  private sourceContent: string;
  private templateContent: string;

  constructor(private sourceFile: string){

    if (!fs.existsSync(path.resolve(path.dirname(this.sourceFile), "template.sql"))) {
      vscode.window.showErrorMessage(`No template found in folder ${path.dirname(this.sourceFile)}`);
      throw new Error("No template found");
    }

    this.sourceContent = fs.readFileSync(this.sourceFile, {encoding: 'base64'});
    this.templateContent = fs.readFileSync(path.resolve(path.dirname(this.sourceFile), "template.sql").split(path.sep).join(path.posix.sep), {encoding: "utf8"});
  }



  async genFile() {
    if (this.sourceContent) {
      let sourceFileName = await vscode.window.showInputBox({value: path.basename(this.sourceFile)+`_${new Date().toISOString().slice(0, 10)}.sql`, prompt:"Enter new filename"});

      if (sourceFileName === undefined) {
        vscode.window.showErrorMessage('Action canceled');
        throw new Error("Action canceled");
      }

      const uploadSQLFile = path.join(path.dirname(this.sourceFile), sourceFileName);
      const inFileName = path.basename(this.sourceFile);


      const template = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, "..", "..", "dist", "report.tmpl.sql").split(path.sep).join(path.posix.sep), "utf8"));
      const content = {
        "inFileName": inFileName,
        "inFileContent": this.sourceContent.match(/.{1,200}/g),
        "uploadTemplate": this.templateContent
      };

      fs.writeFileSync(uploadSQLFile, template(content));

      const currentWorkSpace = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(this.sourceFile));

      if (!currentWorkSpace) {
        vscode.window.showErrorMessage('There is no workspacefolder open.');
        throw new Error("There is no workspacefolder open.");
      }


      const excepPath = [path.join(currentWorkSpace.uri.fsPath, "apex"),
                        path.join(currentWorkSpace.uri.fsPath, "rest"),
                        path.join(currentWorkSpace.uri.fsPath, "static"),
                        path.join(currentWorkSpace.uri.fsPath, "reports")];
      const folders = getAllFiles(currentWorkSpace.uri.fsPath, undefined, excepPath);
      const folder = await vscode.window.showQuickPick(folders);

      let newFile = uploadSQLFile;
      if (folder !== undefined) {
        newFile = path.join(folder, path.basename(uploadSQLFile));

        fs.renameSync(uploadSQLFile, newFile);
      }

      vscode.window.showInformationMessage('File created @' + newFile);
      vscode.window.showTextDocument(vscode.Uri.file(newFile));


    }
  }
}

function getAllFiles(dirPath:string, arrayOfFiles:string[] | undefined, exceptPath:string[]) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(path.join(dirPath, file)).isDirectory() && !file.startsWith(".")) {
      if (!exceptPath.includes(path.join(dirPath, file))) {
        arrayOfFiles?.push(path.join(dirPath, file));
        arrayOfFiles = getAllFiles(path.join(dirPath, file), arrayOfFiles, exceptPath);
      }

    }
  });

  return arrayOfFiles;
}