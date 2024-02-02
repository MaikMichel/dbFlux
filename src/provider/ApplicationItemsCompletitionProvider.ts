import * as fs from 'fs';
import * as path from 'path';
import { CancellationToken, CompletionContext, CompletionItem, CompletionItemKind, CompletionItemProvider, CompletionList, Position, SnippetString, TextDocument } from 'vscode';
import { getWorkspaceRootPath } from '../helper/utilities';

interface APIdetails {
  item_name: string,
  item_desc: string
}

/*

select json_objectagg('F'||a.application_id value (
          select json_objectagg(i.item_name value (
                    json_object('item_name' value i.item_name,
                                'item_desc' value 'Region: '||i.region||' on Page: '||i.page_id||' of Application: '||i.application_id returning clob)
                 ) returning clob)
             from apex_application_page_items i
            where a.application_id = i.application_id
        ) returning clob format json)
  from apex_applications a

*/

export class ApplicationItemsCompletitionProvider implements CompletionItemProvider {
    // This is out cache
    private dictionary: Map<string, Map<string, APIdetails>> = new Map<string, Map<string, APIdetails>>();
    private dictkeys: string[] = [];

    constructor() {
        fs.readFile(path.resolve(getWorkspaceRootPath(), ".vscode", "applicationItems.json"), 'utf8', (error, data) => {
          if(error){
             console.log(error);
             return;
          }

          const tempData = JSON.parse(data);

          this.dictkeys = Object.keys(tempData);
          this.dictkeys.forEach((appID)=>{

            const tempMap = new Map<string, APIdetails>();
            Object.keys(tempData[appID]).forEach((itemName)=>{
               const methodDetails:APIdetails = tempData[appID][itemName] as APIdetails;
               tempMap.set(itemName, methodDetails)
            });

            this.dictionary.set(appID, tempMap);
          });

          console.log('API dictionary successfully loaded.');

     })

    }

    async provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext): Promise<CompletionItem[] | CompletionList<CompletionItem> | null | undefined> {
      console.log('context', context);
      let completionItems: CompletionItem[] = [];

      const wordsOfLine = document.lineAt(position.line).text.split(" ");
      const currentWord = wordsOfLine[wordsOfLine.length-1].split(".");

      if (currentWord.length === 1 && currentWord[0].toUpperCase().replaceAll("'", '').startsWith("P")) {
        completionItems = this.findPageItemsByName("F200", currentWord[0])
      }

      return completionItems.length>0?completionItems:undefined;
    }


    private findPageItemsByName(applicationID: string, searchString: string): CompletionItem[] {
      console.log('searchString', searchString);
      const results: CompletionItem[] = [];

      this.dictionary.get(applicationID)?.forEach((itemDetails) => {
        if (itemDetails.item_name.startsWith(searchString.toUpperCase())) {
        const completionItem = new CompletionItem(itemDetails.item_name, CompletionItemKind.Constant);

        completionItem.detail        = itemDetails.item_desc;
        // completionItem.documentation = itemDetails.item_desc;
        completionItem.preselect     =true;
        completionItem.insertText    = new SnippetString(completionItem.label+"");

        results.push(completionItem);}
      });


      return results;
    }
}