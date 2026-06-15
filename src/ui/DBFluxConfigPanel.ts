import * as fs from "fs";
import * as Handlebars from "handlebars";
import * as path from "path";
import { commands, ExtensionContext, ViewColumn, Webview, WebviewPanel, window } from "vscode";
import { IProjectInfos } from "../provider/AbstractBashTaskProvider";
import { getRestServerInfo } from "../helper/RestApiUtils";
import { LoggingService } from "../helper/LoggingService";
import { getWorkspaceRootPath } from "../helper/utilities";

const PWD_MASK = "••••••••";

export class DBFluxConfigPanel {
  private static currentPanel?: DBFluxConfigPanel;
  private readonly panel: WebviewPanel;

  static createOrShow(context: ExtensionContext): void {
    if (DBFluxConfigPanel.currentPanel) {
      DBFluxConfigPanel.currentPanel.panel.reveal();
      return;
    }

    const panel = window.createWebviewPanel(
      "dbFluxConfig",
      "dbFlux Configuration",
      ViewColumn.One,
      { enableScripts: true }
    );

    DBFluxConfigPanel.currentPanel = new DBFluxConfigPanel(panel, context);
  }

  private constructor(panel: WebviewPanel, context: ExtensionContext) {
    this.panel = panel;

    panel.onDidDispose(() => {
      DBFluxConfigPanel.currentPanel = undefined;
    });

    panel.webview.onDidReceiveMessage(async (msg) => {
      await this.handleMessage(msg, context);
    });

    this.getHtml(panel.webview, context).then(html => {
      panel.webview.html = html;
    });
  }

  private async getHtml(_webview: Webview, context: ExtensionContext): Promise<string> {
    const connMode    = context.workspaceState.get<string>("dbFlux_CONN_MODE") ?? "SQLNET";
    const projectMode = context.workspaceState.get<string>("dbFlux_PROJECT_MODE") ?? "SINGLE";
    const prefix      = getWorkspaceRootPath() + "|";

    const appPwd   = await context.secrets.get(prefix + "dbFlux_DB_APP_PWD");
    const oauthB64 = await context.secrets.get(prefix + "dbFlux_REST_OAUTH_BASIC_B64");

    const ctx = {
      connModeIsRest:     connMode === "REST",
      projectName:        context.workspaceState.get<string>("dbFlux_PROJECT") ?? "",
      projectModeIsSingle: projectMode === "SINGLE",
      projectModeIsMulti:  projectMode === "MULTI",
      projectModeIsFlex:   projectMode === "FLEX",
      // REST
      restSqlUrl:        context.workspaceState.get<string>("dbFlux_REST_SQL_URL") ?? "",
      restOauthTokenUrl: context.workspaceState.get<string>("dbFlux_REST_OAUTH_TOKEN_URL") ?? "",
      restWorkspace:     context.workspaceState.get<string>("dbFlux_REST_WORKSPACE") ?? "",
      restAppSchema:     context.workspaceState.get<string>("dbFlux_REST_APP_SCHEMA") ?? "",
      restOauthBasicB64: oauthB64 ? PWD_MASK : "",
      restAppIdMap:      context.workspaceState.get<string>("dbFlux_REST_APP_ID_MAP") ?? "",
      // SQLNET
      dbTns:       context.workspaceState.get<string>("dbFlux_DB_TNS") ?? "",
      dbAppUser:   context.workspaceState.get<string>("dbFlux_DB_APP_USER") ?? "",
      dbAppPwd:    appPwd ? PWD_MASK : "",
      dbAdminUser: context.workspaceState.get<string>("dbFlux_DB_ADMIN_USER") ?? "",
      workspace:   context.workspaceState.get<string>("dbFlux_WORKSPACE") ?? "",
      appSchema:   context.workspaceState.get<string>("dbFlux_APP_SCHEMA") ?? "",
      dataSchema:  context.workspaceState.get<string>("dbFlux_DATA_SCHEMA") ?? "",
      logicSchema: context.workspaceState.get<string>("dbFlux_LOGIC_SCHEMA") ?? "",
    };

    const tmplPath = path.resolve(__dirname, "..", "..", "dist", "templates", "dbflux_config.tmpl.html")
      .split(path.sep).join("/");
    const template = Handlebars.compile(fs.readFileSync(tmplPath, "utf8"));
    return template(ctx);
  }

  private async handleMessage(msg: any, context: ExtensionContext): Promise<void> {
    if (msg.command === "save") {
      await this.saveConfig(msg, context);
    } else if (msg.command === "testConnection") {
      await this.testConnection(msg, context);
    }
  }

  private async saveConfig(msg: any, context: ExtensionContext): Promise<void> {
    const prefix = getWorkspaceRootPath() + "|";

    context.workspaceState.update("dbFlux_mode", "dbFlux");
    context.workspaceState.update("dbFlux_CONN_MODE", msg.connMode);
    context.workspaceState.update("dbFlux_PROJECT", (msg.projectName ?? "").toLowerCase());

    if (msg.connMode === "REST") {
      context.workspaceState.update("dbFlux_PROJECT_MODE", "SINGLE");
      context.workspaceState.update("dbFlux_REST_SQL_URL",        msg.restSqlUrl ?? "");
      context.workspaceState.update("dbFlux_REST_OAUTH_TOKEN_URL", msg.restOauthTokenUrl ?? "");
      context.workspaceState.update("dbFlux_REST_WORKSPACE",      msg.restWorkspace ?? "");
      context.workspaceState.update("dbFlux_REST_APP_SCHEMA",     msg.restAppSchema ?? "");
      context.workspaceState.update("dbFlux_REST_APP_ID_MAP",     msg.restAppIdMap ?? "");
      if (msg.restOauthBasicB64 && msg.restOauthBasicB64 !== PWD_MASK) {
        await context.secrets.store(prefix + "dbFlux_REST_OAUTH_BASIC_B64", msg.restOauthBasicB64);
      }
    } else {
      context.workspaceState.update("dbFlux_PROJECT_MODE", msg.projectMode ?? "SINGLE");
      context.workspaceState.update("dbFlux_DB_TNS",       msg.dbTns ?? "");
      context.workspaceState.update("dbFlux_DB_APP_USER",  msg.dbAppUser ?? "");
      context.workspaceState.update("dbFlux_DB_ADMIN_USER", msg.dbAdminUser ?? "");
      context.workspaceState.update("dbFlux_WORKSPACE",    msg.workspace ?? "");
      context.workspaceState.update("dbFlux_APP_SCHEMA",   msg.appSchema ?? "");
      if (msg.projectMode === "MULTI") {
        context.workspaceState.update("dbFlux_DATA_SCHEMA",  msg.dataSchema ?? "");
        context.workspaceState.update("dbFlux_LOGIC_SCHEMA", msg.logicSchema ?? "");
      }
      if (msg.dbAppPwd && msg.dbAppPwd !== PWD_MASK) {
        await context.secrets.store(prefix + "dbFlux_DB_APP_PWD", msg.dbAppPwd);
      }
    }

    const sel = await window.showInformationMessage("dbFlux: Configuration saved.", "Reload Window");
    if (sel) {
      commands.executeCommand("workbench.action.reloadWindow");
    }
  }

  private async testConnection(msg: any, context: ExtensionContext): Promise<void> {
    const prefix = getWorkspaceRootPath() + "|";
    let oauthB64 = msg.restOauthBasicB64;
     LoggingService.logDebug("AAA: " + oauthB64);
    if (!oauthB64 || oauthB64 === PWD_MASK) {
      oauthB64 = await context.secrets.get(prefix + "dbFlux_REST_OAUTH_BASIC_B64");
      LoggingService.logDebug("BBB: " + oauthB64);
    }

    const tempInfos = {
      restSqlUrl:        msg.restSqlUrl || context.workspaceState.get<string>("dbFlux_REST_SQL_URL"),
      restOauthTokenUrl: msg.restOauthTokenUrl || context.workspaceState.get<string>("dbFlux_REST_OAUTH_TOKEN_URL"),
      dbAppPwd:          oauthB64,
    } as IProjectInfos;
    LoggingService.logDebug("CCC", tempInfos);
    try {
      const info = await getRestServerInfo(tempInfos);
      const text = `REST API reachable — version: ${info.version ?? "pre 1.1.0"}, api_level: ${info.apiLevel}`;
      LoggingService.logInfo(text);
      this.panel.webview.postMessage({ type: "connectionResult", success: true, message: text });
    } catch (err: any) {
      const text = `REST API not reachable: ${err.message ?? err}`;
      LoggingService.logError(text, err);
      this.panel.webview.postMessage({ type: "connectionResult", success: false, message: text });
    }
  }

  dispose(): void {
    this.panel.dispose();
  }
}
