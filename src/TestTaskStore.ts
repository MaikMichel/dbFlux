export class TestTaskStore {
  private static _instance: TestTaskStore;
  private _selectedSchemas: string[] | undefined;

  public get selectedSchemas(): string[] | undefined {
    return this._selectedSchemas;
  }
  public set selectedSchemas(value: string[] | undefined) {
    this._selectedSchemas = value;
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