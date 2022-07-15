import { join, posix } from "path";
import { commands, extensions, Uri, window, workspace } from "vscode";

const DBFLUX_EXT_ID = "MaikMichel.dbFlow"
const USER_CONFIG_FILE_NAME = 'user.dbFlux.config.json';

type VersionConfig = {
  changelog?: { lastversion?: string };
};

type PackageJSON = {
  version: string;
};

type InstallationType = {
  firstInstall: boolean;
  update: boolean;
};

export interface IUpdateInfoProvider {
  init: () => Promise<void>;
  getPackageJSON: () => PackageJSON;
  getInstallationType: () => Record<string, unknown>;
}

class UpdateInfoProvider implements IUpdateInfoProvider {
  installationType: InstallationType = {firstInstall:false, update:false};
  private readonly userConfigFileUri: Uri;
  // private configJSON: VersionConfig = {};

  constructor() {
    const extensionFolderUri = Uri.file(extensions.getExtension(DBFLUX_EXT_ID)!.extensionPath);
    // this.configFileUri = extensionFolderUri.with({path: posix.join(extensionFolderUri.path, CONFIG_FILE_NAME)});
    this.userConfigFileUri = extensionFolderUri.with({path: posix.join(extensionFolderUri.path, USER_CONFIG_FILE_NAME)});
  }

  getPackageJSON(): PackageJSON {
    return extensions.getExtension(DBFLUX_EXT_ID)?.packageJSON;
  }

  getInstallationType(): InstallationType {
    return this.installationType;
  }

  async init(): Promise<void> {
    try {
      const version = this.getPackageJSON().version;
      const userConfig = await this.getUserConfig();
      this.installationType = {
        update: (userConfig! && this.isVersionUpdate(userConfig)),
        firstInstall: !userConfig
      };

      const userConfigUpdate = {changelog: {lastversion: version}};
      await workspace.fs.writeFile(this.userConfigFileUri, Buffer.from(JSON.stringify(userConfigUpdate), 'utf-8'));
    } catch (error) {
        await window.showErrorMessage(`dbFlux: there was an error while loading the configuration. Please retry or open an issue: ${String(error)}`);
    }
  }

  private isVersionUpdate(userConfig: VersionConfig): boolean {
    const splitVersion = (input: string): {major: number; minor: number; patch: number} => {
      const [major, minor, patch] = input.split('.').map(i => parseInt(i, 10));
      return {major, minor, patch};
    };

    const packageJSON = this.getPackageJSON();

    const versionCurrent = splitVersion(packageJSON.version);
    const versionOld = splitVersion(userConfig.changelog?.lastversion || "0.0.0");

    const update = (
      versionCurrent.major > versionOld.major ||
      versionCurrent.minor > versionOld.minor ||
      versionCurrent.patch > versionOld.patch
    );

    return update;
  }

  private async getUserConfig(): Promise<VersionConfig | undefined> {
    try {
      const configBuffer = await workspace.fs.readFile(this.userConfigFileUri);
      const configContent = Buffer.from(configBuffer).toString('utf8');
      return JSON.parse(configContent) as VersionConfig;
    } catch {}
  }

  async askShowChangelog(): Promise<boolean> {
    return await window.showInformationMessage(
      `dbFlux was updated to ${this.getPackageJSON().version} . Check the changelog for more details.`,
      'Show me', 'Maybe later') === 'Show me';
  }

  showChangeLog():void {
    let uri = Uri.file(join(__dirname, '..', '..', 'CHANGELOG.md'))
    commands.executeCommand('markdown.showPreview', uri)
    // commands.executeCommand('extension.open', DBFLUX_EXT_ID)
  }
}

export const extensionManager = new UpdateInfoProvider();
