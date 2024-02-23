
export class TestTaskStore {
  private static _instance: TestTaskStore;
  private _selectedSchemas: string[] | undefined;
  private _fileName: string | undefined;
  private _selectedMethod: string | undefined;
  private _targetPackage: string | undefined;


  public get selectedMethod(): string | undefined {
    return this._selectedMethod;
  }
  public set selectedMethod(value: string | undefined) {
    this._selectedMethod = value;
  }

  public get targetPackage(): string | undefined {
    return this._targetPackage;
  }
  public set targetPackage(value: string | undefined) {
    this._targetPackage = value;
  }

  public get fileName(): string | undefined {
    return this._fileName;
  }
  public set fileName(value: string | undefined) {
    this._fileName = value;
  }



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