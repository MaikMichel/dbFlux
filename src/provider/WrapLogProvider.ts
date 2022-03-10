import { commands, Position, Range, Selection, TextDocument, TextEditor, TextEditorEdit, TextLine, window, workspace } from "vscode";


export function registerWrapLogSelection() {
  return commands.registerCommand('dbFlux.wrapLogSelection', () => {edit(Direction.None);});
}

export function registerWrapLogSelectionDown() {
  return commands.registerCommand('dbFlux.wrapLogSelection.down', () => {edit(Direction.Down);});
}

export function registerWrapLogSelectionUp() {
  return commands.registerCommand('dbFlux.wrapLogSelection.up', () => {edit(Direction.Up);
  });
}



const edit = (direction: Direction) => {
  let editor: TextEditor = window.activeTextEditor!;

  var doc: TextDocument = editor.document;
  var wrapper: string = getWrapWithFunctionCall(editor.document.languageId);

  editor.edit(function (edit: TextEditorEdit): void {
    for (var x: number = 0; x < editor.selections.length; x++) {
      const selRange = new Range(editor.selections[x].start, editor.selections[x].end);
      let selectedText: string = doc.getText(selRange);
      let selLine: TextLine = doc.lineAt(editor.selections[x].end.line);

      let insertPos: Range = selLine.range;
      let insertLineText: string = selLine.text;

      let indentCharactersLine: number = editor.selections[x].end.line + (direction === Direction.Down ? 1 : 0);

      if (direction === Direction.Down && getIndentString(indentCharactersLine).length < getIndentString(indentCharactersLine - 1).length) { indentCharactersLine--; };
      let indent: string = getIndentString(indentCharactersLine);

      if (direction === Direction.Down) {
        edit.replace(insertPos, insertLineText + '\n' + indent + replaceSelectedFunctionCall(selectedText, wrapper));
      } else if (direction === Direction.Up) {
        edit.replace(insertPos, indent + replaceSelectedFunctionCall(selectedText, wrapper) + '\n' + insertLineText);
      } else {
        edit.replace(selRange, replaceSelectedFunctionCall(selectedText, wrapper));
      }
    }

    // position to place the cursor?
    const tpos: Position = new Position(editor.selection.start.line, editor.document.lineAt(editor.selection.start.line).range.end.character);
    editor.selection = new Selection(tpos, tpos);
  });
};


function getIndentString(lineNumber: number): string {
  let doc = window.activeTextEditor!.document;
  if (doc.lineCount > lineNumber && lineNumber >= 0) { return "" + (doc.lineAt(lineNumber).text.match(/^\s+/) || ['']).shift(); };
  return '';
}

function getWrapWithFunctionCall(lang: string): string {
  let methods:any = workspace.getConfiguration("dbFlux.languageBasedLogWrappers");
  return methods[lang.toLowerCase()] || "console.log('$LBL', $VAR);";
}

function replaceSelectedFunctionCall(selection: string, method: string): string {
  return method.replace(/\$LBL/g, selection.replace(/(\"|')/g, "\\$1")).replace(/\$VAR/g, selection);
}

// eslint-disable-next-line @typescript-eslint/naming-convention
enum Direction { Up = 1, Down = -1, None = 0 }
