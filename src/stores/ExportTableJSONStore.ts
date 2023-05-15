
export class ExportTableJSONStore {
  private static _instance: ExportTableJSONStore;
  private _fileName: string | undefined;

  public get fileName(): string | undefined {
    return this._fileName;
  }
  public set fileName(value: string | undefined) {
    this._fileName = value;
  }


  private constructor()
  {
      //...
  }

  public static getInstance()
  {
      // Do you need arguments? Make it a regular static method instead.
      return this._instance || (this._instance = new this());
  }
}