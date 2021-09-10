export class CompileTaskStore {
  private static _instance: CompileTaskStore;
  private _appPwd: string | undefined;
  private _adminPwd: string | undefined;
  private _adminUser: string | undefined;

  public get appPwd(): string | undefined {
    return this._appPwd;
  }
  public set appPwd(value: string | undefined) {
    this._appPwd = value;
  }

  public get adminPwd(): string | undefined {
    return this._adminPwd;
  }
  public set adminPwd(value: string | undefined) {
    this._adminPwd = value;
  }

  public get adminUser(): string | undefined {
    return this._adminUser;
  }
  public set adminUser(value: string | undefined) {
    this._adminUser = value;
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