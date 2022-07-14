export class ExportDBSchemaStore {
  private static _instance: ExportDBSchemaStore;
  private _schemaName: string|undefined;
  private _schemaNameNew: string | undefined;

  public get schemaNameNew(): string | undefined {
    return this._schemaNameNew;
  }
  public set schemaNameNew(value: string | undefined) {
    this._schemaNameNew = value;
  }

  public get schemaName(): string|undefined{
    return this._schemaName;
  }
  public set schemaName(value: string|undefined) {
    this._schemaName = value;
  }

  private constructor() {
  }

  public static getInstance()
  {
      // Do you need arguments? Make it a regular static method instead.
      return this._instance || (this._instance = new this());
  }

}
