export class CompileTaskStore {
  private static _instance: CompileTaskStore;
  private _appPwd: string | undefined;

  public get appPwd(): string | undefined {
    return this._appPwd;
  }
  public set appPwd(value: string | undefined) {
    this._appPwd = value;
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