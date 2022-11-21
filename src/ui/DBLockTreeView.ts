import { commands, Event, EventEmitter, ProviderResult, ThemeIcon, TreeDataProvider, TreeItem, TreeItemCollapsibleState, window, workspace } from 'vscode'
import { ViewFileDecorationProvider } from '../provider/ViewFileDecorationProvider';
import { getWorkspaceRootPath } from '../helper/utilities';


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

    public add_child (child : DBLockTreeItem) {
        this.collapsibleState = TreeItemCollapsibleState.Expanded;
        this.children.push(child);
    }
}

// tree_view will created in our entry point
export class DBLockTreeView implements TreeDataProvider<DBLockTreeItem>
{
    static osUser:string = process.env.username?process.env.username:"none";


    private m_data : DBLockTreeItem [] = [];

    // with the EventEmitter we can refresh our  tree view
    private m_onDidChangeTreeData: EventEmitter<DBLockTreeItem | undefined> = new EventEmitter<DBLockTreeItem | undefined>();
    // and vscode will access the event by using a readonly onDidChangeTreeData (this member has to be named like here, otherwise vscode doesnt update our treeview.
    readonly onDidChangeTreeData ? : Event<DBLockTreeItem | undefined> = this.m_onDidChangeTreeData.event;

    // cause our decowriter holds the logic to fetch, we use this here
    // ToDo: this should be refactored
    private m_deco_provider:ViewFileDecorationProvider;

    public constructor(decoProvider: ViewFileDecorationProvider)  {
      this.m_deco_provider = decoProvider;
      commands.registerCommand('dbflux.dblock.treeview.item_clicked', r => this.item_clicked(r));
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
            return this.m_data;
        } else {
            return element.children;
        }
    }

    public item_clicked(item: DBLockTreeItem) {

      if (item.file !== undefined) {
        workspace.openTextDocument(getWorkspaceRootPath() + '/' + item.file).then(doc => {
          window.showTextDocument(doc);
        });
      }
    }

    // this is called whenever we refresh the tree view
    public async refresh() {
      this.m_data = [];
      const users:any = {};

      // call provider to refresh cache
      await this.m_deco_provider.refreshCache();

      // get only the distinct users involved
      const uniqueUsers = [...new Set(this.m_deco_provider.getCachedUsers())];
      uniqueUsers.forEach(element => {
        users[element] = new DBLockTreeItem(element, undefined, element);
        this.m_data.push(users[element]);
      });

      // now get all files and place them underneath users
      const files:string[] = this.m_deco_provider.getCachedFiles();
      for (let i = 0; i<files.length; i++) {
        (users[this.m_deco_provider.getCachedUsers()[i]] as DBLockTreeItem).add_child(new DBLockTreeItem(files[i], files[i], undefined))
      }

      // call to let VSCode refresh the tree
      this.m_onDidChangeTreeData.fire(undefined);
    }

}
