import { existsSync, readFileSync } from 'fs';
import * as path from "path";
import { CancellationToken, commands, DataTransfer, DataTransferItem, DocumentDropEdit, DocumentDropEditProvider, env, Event, EventEmitter, ExtensionContext, languages, Position, ProviderResult, SnippetString, TextDocument, ThemeIcon, TreeDataProvider, TreeDragAndDropController, TreeItem, TreeItemCollapsibleState, TreeView, window, workspace } from 'vscode';
import { chooseSnippetWizard, getAvailableSnippetKeys, getSnippedBody } from '../wizards/ChooseSnippetWizzard';
import { LoggingService } from '../helper/LoggingService';
import { showInformationProgress } from '../helper/utilities';


const uriListMime = 'text/uri-list';
const workspaceStateKey = 'DBFLUX_TABLE_TREE';
/**
 * Hold information about the columns
 */
interface ColumnProps {
  columnName:      string;
  dataType:        string  | undefined;
  dataLength:      string  | undefined;
  hasDefaultValue: boolean | undefined;
  isNotNull:       boolean | undefined;
}


/**
 * TreeItem to represent the Node itself
 * It could be of type table or column (contextValue)
 */
class TableColumnItem extends TreeItem {

  public children: TableColumnItem[] = [];
  public parentTableItem: string | undefined = undefined;


  /**
   * Multiple Constructors are not allowed so, I deal with this way
   *
   * @param columnProperties
   * @param tableFileName
   */
  constructor(columnProperties: ColumnProps|undefined, tableFileName: string | undefined) {
    super(columnProperties?columnProperties.columnName:tableFileName?path.basename(tableFileName).replace(path.extname(tableFileName), ""):"/", TreeItemCollapsibleState.None);

    if (tableFileName){
      this.tooltip      = `${tableFileName}`;
      this.description  = `${tableFileName}`;
      this.contextValue = "table";

      // Seee https://microsoft.github.io/vscode-codicons/dist/codicon.html
      this.iconPath = new ThemeIcon('table');

    } else if (columnProperties) {
      if (!columnProperties.hasDefaultValue) {
        this.tooltip = `${columnProperties.columnName} - ${columnProperties.dataType}(${columnProperties.dataLength}) ${columnProperties.isNotNull?"- [Required]":""}`;
      } else {
        this.tooltip = `${columnProperties.columnName} - ${columnProperties.dataType}(${columnProperties.dataLength}) ${columnProperties.isNotNull?"- [Required]":""} - [DefaultValue: ${columnProperties.hasDefaultValue}]`;
      }
      this.description = `${columnProperties.dataType}`;
      this.contextValue = "column";

      this.iconPath = new ThemeIcon(columnProperties.isNotNull?'circle-filled':'circle');
    }
  }

  public add_child (child : TableColumnItem) {
      this.collapsibleState = TreeItemCollapsibleState.Expanded;
      child.parentTableItem = ""+this.label?.toString();
      this.children.push(child);

  }

  public remove_childs(){
    this.children = [];
  }
}

/**
 * Here is the action implemented ;-)
 */
export class DBFluxTableDetails implements TreeDataProvider<TableColumnItem>, TreeDragAndDropController<TableColumnItem>, DocumentDropEditProvider  {
    dropMimeTypes = [];
    dragMimeTypes = [];

    private treeView : TreeView<TableColumnItem>;
    private treedata : TableColumnItem [] = [];
    private treeContext:ExtensionContext;

    // with the EventEmitter we can refresh our  tree view
    private m_onDidChangeTreeData: EventEmitter<TableColumnItem | undefined> = new EventEmitter<TableColumnItem | undefined>();

    // and vscode will access the event by using a readonly onDidChangeTreeData (this member has to be named like here, otherwise vscode doesnt update our treeview.
    readonly onDidChangeTreeData ? : Event<TableColumnItem | undefined> = this.m_onDidChangeTreeData.event;


    constructor(context:ExtensionContext){
      this.treeView = window.createTreeView("dbflux.showTableDetails.treeview", {treeDataProvider:this, canSelectMany: true, showCollapseAll:true, dragAndDropController: this});
      this.treeContext = context;
      this.treeView.description = `Column Viewer`;
      this.treeView.title = "dbStruct";
      context.subscriptions.push(this.treeView );

      const selector = [{ language: "plsql", scheme: "file" }, { language: "sql", scheme: "file" }];

      context.subscriptions.push(commands.registerCommand('dbflux.showTableDetails.treeview.clear_items',  () => this.clear()));
      context.subscriptions.push(commands.registerCommand('dbflux.showTableDetails.treeview.refresh_items',  () => this.refresh()));
      context.subscriptions.push(commands.registerCommand('dbflux.showTableDetails.treeview.clear_item', (selectedItem) => this.clear_item(selectedItem)));

      context.subscriptions.push(commands.registerCommand('dbflux.showTableDetails.treeview.copy_selection_with_comma',  () => this.copySelectionToClipboard(", ")));
      context.subscriptions.push(commands.registerCommand('dbflux.showTableDetails.treeview.copy_selection_with_semicomma',  () => this.copySelectionToClipboard(";\n")));
      context.subscriptions.push(commands.registerCommand('dbflux.showTableDetails.treeview.copy_selection_with_colon',  () => this.copySelectionToClipboard(":")));
      context.subscriptions.push(commands.registerCommand('dbflux.showTableDetails.treeview.copy_selection_with_colonequal',  () => this.copySelectionToClipboard(" := \n")));

      context.subscriptions.push(languages.registerDocumentDropEditProvider(selector, this));

      this.loadLastTables();
    }

    loadLastTables(){
      if (workspace.workspaceFolders) {
        // get state
        const oldFString:any = this.treeContext.workspaceState.get(workspaceStateKey) as string;

        let oldFiles:any[];
        // sometimes it's an array, but then its first item is undefined
        if (!Array.isArray(oldFString)) {
          oldFiles = oldFString?.split('|');
        } else {
          oldFiles = oldFString;
        }

        if (oldFiles) {
          // clear the full state
          this.treeContext.workspaceState.update(workspaceStateKey, undefined);

          LoggingService.logInfo(`Loading last added TableFiles`);
          // which is stored by default in addTable itself
          oldFiles.forEach((file:any) => {
            const tableFile = path.join(workspace.workspaceFolders![0].uri.fsPath, 'db', file);
            if (existsSync(tableFile)) {
              LoggingService.logDebug(`loading: ${file}`);
              this.addTable(file);
            }
          });
        }

      }
    }

    /**
     * called when dropped into editor
     */
    async provideDocumentDropEdits(document: TextDocument, position: Position, dataTransfer: DataTransfer, token: CancellationToken): Promise<DocumentDropEdit | undefined> {
      // Check the data transfer to see if we have dropped a list of uris
      const dataTransferItem = dataTransfer.get(uriListMime);
      if (!dataTransferItem) {
        return undefined;
      }

      const treeItems: TableColumnItem[] = JSON.parse(await dataTransferItem.value);
      const definedSnippets = await getAvailableSnippetKeys();

      if (definedSnippets.length ===0) {
        const sepToDragWith:string = workspace.getConfiguration("dbFlux.showTableDetails").get("DragSelectionWith") || ", ";
        const labels = treeItems.map((item)=>{
          return item.children.length > 0 ? item.children.map((child) => item.label + "." + child.label).join(sepToDragWith): item.label;
        });


        return new DocumentDropEdit(labels.join(sepToDragWith) + (sepToDragWith.includes("\n") ? sepToDragWith : ""));
      } else {
        const snippet = await this.getDragSelectionWithSnippet(treeItems);
        return new DocumentDropEdit(snippet);
      }
    }

    /**
     * bring selection to clipbord
     * @param sep string to seperate the selection
     */
    private copySelectionToClipboard(sep:string) {
      const labels = this.treeView.selection.map((item)=>{
        return item.children.length > 0 ? item.children.map((child) => item.label + "." + child.label).join(sep): item.label;
      });

      env.clipboard.writeText(labels.join(sep) + ([";\n", " := \n"].includes(sep)?sep:""));
      window.setStatusBarMessage('dbFlux: Selection written to ClipBoard', 2000);
    }

    private async getDragSelectionWithSnippet(treeItems:TableColumnItem[]) : Promise<SnippetString> {
      // show Wizard
      const pickedSnipped = await chooseSnippetWizard();

      // if not canceled prep snippet
      if (pickedSnipped?.pickedSnipped) {
        //
        const bodyLines:string[] = await getSnippedBody(pickedSnipped?.pickedSnipped.label);
        const labels:{table:string, column:string}[] = [];

        treeItems.forEach(element => {
          if(element.children.length > 0) {
            element.children.forEach(childElement => {
              labels.push({
                table:  "" + childElement.label?.toString(),
                column: "" + childElement.label?.toString()});
            })
          } else {
            labels.push({
              table:  "" + element.parentTableItem,
              column: "" + element.label?.toString()
            });
          }
        });

        // build the snippet
        let touchedBodyLines:string[] = [];
        for (let i=0; i < labels.length; i++) {
          const item = labels[i];

          const variablen = {
            "DBFLUX_TABLE": item.table.toUpperCase(),
            "dbflux_table": item.table.toLowerCase(),
            "DBFLUX_COLUMN": item.column.toUpperCase(),
            "dbflux_column": item.column.toLowerCase(),
          };

          touchedBodyLines.push(this.replaceVars(bodyLines.join("\n"), variablen));
        }

        // build your snippet with the SnippetString methods
        const snippet = new SnippetString(touchedBodyLines.join("\n"));
        return snippet;
      }
      return new SnippetString("");

    }

    // Funktion zum Ersetzen von Platzhaltern im String
    replaceVars(inputString: string, vars: { [key: string]: string }): string {
      for (const key in vars) {
          if (vars.hasOwnProperty(key)) {
              const marker = new RegExp(`§{${key}}`, 'g');
              inputString = inputString.replace(marker, vars[key]);
          }
      }
      return inputString;
    }

    handleDrag(source: readonly TableColumnItem[], dataTransfer: DataTransfer, token: CancellationToken): void | Thenable<void> {
      dataTransfer.set(uriListMime, new DataTransferItem(source));
    }

    /**
     * not implemented
     */
    handleDrop?(target: TableColumnItem | undefined, dataTransfer: DataTransfer, token: CancellationToken): void | Thenable<void> {}


    /**
     * clear the whole tree
     */
    private clear() {
      this.treedata = [];

      this.treeContext.workspaceState.update(workspaceStateKey, undefined);

      // call to let VSCode refresh the tree
      this.m_onDidChangeTreeData.fire(undefined);
    }

    /**
     * clear only table with dependend columns
     * @param selectedItem table
     */
    private clear_item(selectedItem:TableColumnItem) {
      LoggingService.logInfo(`removing table ${selectedItem.label} from view`)

      // assign new filteres treeitems (without the selected one)
      this.treedata = this.treedata.filter(treeItem => (selectedItem?.description !== treeItem.description));

      // remove that file from persisted global state
      const oldFString:any = this.treeContext.workspaceState.get(workspaceStateKey) as string;

      let oldFiles:any[];

      // sometimes it's an array, but then its first item is undefined
      if (!Array.isArray(oldFString)) {
        oldFiles = oldFString?.split('|');
      } else {
        oldFiles = oldFString;
      }

      const subset = oldFiles.filter((str: string | boolean | undefined) => (str !== selectedItem.description));

      if (subset) {
        this.treeContext.workspaceState.update(workspaceStateKey, subset);
      }

      // call to let VSCode refresh the tree
      this.m_onDidChangeTreeData.fire(undefined);
    }


    public getTreeItem(item: TableColumnItem): TreeItem|Thenable<TreeItem> {
        return item;
    }


    public getChildren(element : TableColumnItem | undefined): ProviderResult<TableColumnItem[]> {
        if (element === undefined) {
            return this.treedata;
        } else {
            return element.children;
        }
    }


    private async refresh() {
      if (workspace.workspaceFolders){
        this.treeContext.workspaceState.update(workspaceStateKey, undefined);

        for (let tableItem of this.treedata) {
          const tableFile = path.join(workspace.workspaceFolders[0].uri.fsPath, 'db', ""+tableItem.description!);

          if (existsSync(tableFile)) {
            this.buildAndParsChildColumns(tableFile, tableItem);
            this.treeContext.workspaceState.update(workspaceStateKey, this.treeContext.workspaceState.get(workspaceStateKey) + '|' + tableItem.description!)
          } else {
            this.clear_item(tableItem);
          }
        }

        this.m_onDidChangeTreeData.fire(undefined);
      }

      commands.executeCommand("dbflux.showTableDetails.treeview.focus");
    }

    public async addTable(fileName: string, saveState: boolean = true) {
      const tableItem = new TableColumnItem(undefined, fileName);
      const tmpItem = this.treedata.find(treeItem => (tableItem.contextValue === treeItem.contextValue && tableItem.description === treeItem.description));

      if (tmpItem) {
        showInformationProgress(`${tableItem.label} allready added to Structure-Viewer`);
      } else if (workspace.workspaceFolders){
        const tableFile = path.join(workspace.workspaceFolders[0].uri.fsPath, 'db', fileName);

        if (existsSync(tableFile)) {
          this.buildAndParsChildColumns(tableFile, tableItem);

          if (saveState) {
            this.treeContext.workspaceState.update(workspaceStateKey, this.treeContext.workspaceState.get(workspaceStateKey) + '|' + fileName)
          }
        }

        this.treedata.push(tableItem);
        this.m_onDidChangeTreeData.fire(undefined);
      }

      commands.executeCommand("dbflux.showTableDetails.treeview.focus");
    }

    private buildAndParsChildColumns(tableFile: string, tableItem: TableColumnItem) {
      const fileContent = readFileSync(tableFile).toString();
      const columnMap = this.parseCreateTableScript(fileContent);

      tableItem.remove_childs();
      columnMap.forEach((columnProp) => {
        tableItem.add_child(new TableColumnItem(columnProp, undefined));
      });
    }

    findClosingBracketMatchIndex(str:string, pos:number) {
      if (str[pos] != '(') {
        throw new Error("No '(' at index " + pos);
      }
      let depth = 1;
      for (let i = pos + 1; i < str.length; i++) {
        switch (str[i]) {
          case '(':
            depth++;
            break;
          case ')':
            if (--depth == 0) {
              return i;
            }
            break;
        }
      }
      return -1;    // No matching closing parenthesis
    }

    /**
     * get the content between the first parentheses and parse each line
     *
     * @param script content to be parsed
     * @returns Map of ColumnProps
     */
    private parseCreateTableScript(script: string): Map<string, ColumnProps> {
      const columnMap              = new Map<string, ColumnProps>();
      const closingBrack           = this.findClosingBracketMatchIndex(script, script.indexOf("("))
      const columnDefinitionsLines = script.substring(script.indexOf("(")+1, closingBrack).replaceAll("\r", "").split("\n");
      const columnRegex            =  /(\w+)\s+(\w+)(?:\(([^\)]+)\))?(.*)/;


      for (let columnDefinitions of columnDefinitionsLines){
        const columnMatch = columnRegex.exec(columnDefinitions.trim());

        if (columnMatch) {
          const extraInfo = columnMatch[4] ? columnMatch[4].trim() : undefined;
          const prop:ColumnProps = {
            columnName      : columnMatch[1],
            dataType        : columnMatch[2],
            dataLength      : columnMatch[3] ? columnMatch[3].replace(/\s/g, '') : '',
            hasDefaultValue : extraInfo?.includes('default '),
            isNotNull       : extraInfo?.includes('not null')
          };

          columnMap.set(prop.columnName!, prop );
        }
      }

      return columnMap;
    }
}
