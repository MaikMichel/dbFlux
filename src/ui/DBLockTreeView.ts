import { commands, Event, EventEmitter, ProviderResult, TreeDataProvider, TreeItem, TreeItemCollapsibleState, TreeView, window, workspace } from 'vscode';
import { ViewFileDecorationProvider } from '../provider/ViewFileDecorationProvider';
import { getWorkspaceRootPath } from '../helper/utilities';
import { homedir } from 'os';
import { basename } from 'path';


class DBLockTreeItem extends TreeItem
{
    readonly file: string | undefined;
    public children: DBLockTreeItem[] = [];

    constructor(label: string, file: string|undefined, osUser:string|undefined) {
      super(label, TreeItemCollapsibleState.None);
      this.file = file;
      this.collapsibleState = TreeItemCollapsibleState.None;

      // not working don't know why
      if (osUser !== undefined) {
        this.iconPath = ((osUser === DBLockTreeView.osUser )? "eye":"heart");
      }
    }

    public addChild(child: DBLockTreeItem) {
        this.collapsibleState = TreeItemCollapsibleState.Expanded;
        this.children.push(child);
    }
}

// tree_view will created in our entry point
export class DBLockTreeView implements TreeDataProvider<DBLockTreeItem>
{
    static osUser:string = process.env.username?process.env.username:basename(homedir());
    private treeView : TreeView<DBLockTreeItem>;

    private mData : DBLockTreeItem [] = [];

    // with the EventEmitter we can refresh our  tree view
    private mOnDidChangeTreeData: EventEmitter<DBLockTreeItem | undefined> = new EventEmitter<DBLockTreeItem | undefined>();
    // and vscode will access the event by using a readonly onDidChangeTreeData (this member has to be named like here, otherwise vscode doesnt update our treeview.
    readonly onDidChangeTreeData ? : Event<DBLockTreeItem | undefined> = this.mOnDidChangeTreeData.event;

    // cause our decowriter holds the logic to fetch, we use this here
    // ToDo: this should be refactored
    private mDecoProvider:ViewFileDecorationProvider;

    public constructor(decoProvider: ViewFileDecorationProvider)  {

      this.treeView = window.createTreeView("dbflux.dblock.treeview", {treeDataProvider:this, canSelectMany: false, showCollapseAll:true});
      this.treeView.description = `Locked Files by User`;
      this.treeView.title = "dbLock";

      decoProvider.context.subscriptions.push(this.treeView );

      this.mDecoProvider = decoProvider;
      commands.registerCommand('dbflux.dblock.treeview.item_clicked', r => this.itemClicked(r));
      commands.registerCommand('dbflux.dblock.treeview.view_refresh', () => this.refresh());
    }


    public getTreeItem(item: DBLockTreeItem): TreeItem|Thenable<TreeItem> {

        const title = item.label ? item.label.toString() : "";
        const result = new TreeItem(title, item.collapsibleState);
        result.command = { command: 'dbflux.dblock.treeview.item_clicked', title : title, arguments: [item] };

        return result;
    }


    public getChildren(element : DBLockTreeItem | undefined): ProviderResult<DBLockTreeItem[]> {
        if (element === undefined) {
            return this.mData;
        } else {
            return element.children;
        }
    }

    public itemClicked(item: DBLockTreeItem) {

      if (item.file !== undefined) {
        workspace.openTextDocument(getWorkspaceRootPath() + '/' + item.file).then(doc => {
          window.showTextDocument(doc);
        });
      }
    }

    // this is called whenever we refresh the tree view
    public async refresh() {
      this.mData = [];
      const users:any = {};

      // call provider to refresh cache
      await this.mDecoProvider.refreshCache();

      // get only the distinct users involved
      const uniqueUsers = [...new Set(this.mDecoProvider.getCachedUsers())];
      uniqueUsers.forEach(element => {
        users[element] = new DBLockTreeItem(element, undefined, element);
        this.mData.push(users[element]);
      });

      // now get all files and place them underneath users
      const files:string[] = this.mDecoProvider.getCachedFiles();
      for (let i = 0; i<files.length; i++) {
        (users[this.mDecoProvider.getCachedUsers()[i]] as DBLockTreeItem).addChild(new DBLockTreeItem(files[i], files[i], undefined));
      }

      // call to let VSCode refresh the tree
      this.mOnDidChangeTreeData.fire(undefined);
    }

}
