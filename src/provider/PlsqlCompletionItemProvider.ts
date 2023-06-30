import * as path from 'path';
import * as fs from 'fs';
import { serialize } from 'v8';
import { CancellationToken, CompletionContext, CompletionItem, CompletionItemKind, CompletionItemProvider, CompletionList, MarkdownString, Position, ProviderResult, SnippetString, TextDocument, TextLine, Uri } from 'vscode';
import { outputLog } from '../helper/OutputChannel';

interface ApiDetails {
  packageName: string,
  procFuncName: string,
  bodyNoDefault: string,
  bodyFullText: string,
  url: string,
  descriptionText: string
}


export class PlsqlCompletionItemProvider implements CompletionItemProvider {
    // This is out cache
    private dictionary: Map<string, Map<string, ApiDetails>> = new Map<string, Map<string, ApiDetails>>();
    private dictkeys: string[] = [];

    constructor() {
        // Load the dictionary
        // this.dictionary = require(path.resolve(__dirname, "..", "..", "dist", "dings.json"));

        fs.readFile(path.resolve(__dirname, "..", "..", "dist", "dings.json"), 'utf8', (error, data) => {
          if(error){
             console.log(error);
             return;
          }

          const tempData = JSON.parse(data);

          this.dictkeys = Object.keys(tempData);
          this.dictkeys.forEach((packageName)=>{

            const tempMap = new Map<string, ApiDetails>();
            Object.keys(tempData[packageName]).forEach((methodName)=>{
              const methodDetails:ApiDetails = tempData[packageName][methodName] as ApiDetails;

              tempMap.set(methodName, methodDetails)
            });

            this.dictionary.set(packageName, tempMap);
          });

          console.log('API dictionary successfully loaded.');

     })

    }

    async provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext): Promise<CompletionItem[] | CompletionList<CompletionItem> | null | undefined> {
      let completionItems: CompletionItem[] = [];

      const wordsOfLine = document.lineAt(position.line).text.split(" ");
      console.log('wordsOfLine', wordsOfLine[0]);
      const currentWord = wordsOfLine[wordsOfLine.length-1].split(".");
      console.log('currentWord', currentWord);
      switch(currentWord.length) {
          case 1:
            completionItems = this.findPackageByName(currentWord[0]);
            break;
          case 2:
            completionItems = this.findMethodByName(currentWord[0]);
            break;
          default:
            //
      }

      return completionItems.length>0?completionItems:undefined;
    }



    private findPackageByName(searchString: string): CompletionItem[] {
      const results: CompletionItem[] = [];

      this.dictkeys.filter((packageName: string) => {
          return packageName.toLowerCase().startsWith(searchString.toLowerCase());
        }).forEach((packageName: string) => {
          const completionItem            = new CompletionItem(packageName.toLowerCase(), CompletionItemKind.Class);
          completionItem.commitCharacters = ["."];
          results.push(completionItem);
        }
      );




      return results.concat(this.findPageItemsByName("APP_1000"));
    }

    private findMethodByName(searchString: string): CompletionItem[] {
      const results: CompletionItem[] = [];

      this.dictionary.get(searchString.toUpperCase())?.forEach((methodDetails) => {
        const completionItem = new CompletionItem(methodDetails.procFuncName, CompletionItemKind.Method);

        completionItem.detail        = methodDetails.bodyFullText;
        completionItem.documentation = new MarkdownString(methodDetails.descriptionText + "\n\n["+methodDetails.url+"]("+methodDetails.url+")\n");
        completionItem.preselect     = true;
        completionItem.insertText    = new SnippetString(completionItem.label + '(' + methodDetails.bodyNoDefault + ');');

        results.push(completionItem);
      });


      return results;
    }

    private findPageItemsByName(searchString: string): CompletionItem[] {
      const results: CompletionItem[] = [];

      this.dictionary.get(searchString.toUpperCase())?.forEach((methodDetails) => {
        console.log('findPageItemsByName.methodDetails', methodDetails);
        const completionItem = new CompletionItem(methodDetails.procFuncName, CompletionItemKind.Constant);

        completionItem.detail        = methodDetails.bodyFullText;
        completionItem.documentation = methodDetails.descriptionText;
        completionItem.preselect     =true;
        completionItem.insertText    = new SnippetString(completionItem.label+"");

        results.push(completionItem);
      });


      return results;
    }
}