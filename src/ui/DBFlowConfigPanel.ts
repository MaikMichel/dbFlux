import * as fs from "fs";
import * as Handlebars from "handlebars";
import * as path from "path";
import * as dotenv from "dotenv";
import { commands, ExtensionContext, ViewColumn, Webview, WebviewPanel, window, workspace } from "vscode";
import { getWorkspaceRootPath } from "../helper/utilities";
import type { State } from "../provider/GenerateDBFlowProjectProvider";

const PWD_MASK = "••••••••";

type DBFlowEnv = Record<string, string>;
type InitializeCallback = (state: State) => Promise<void>;

export class DBFlowConfigPanel {
  private static currentPanel?: DBFlowConfigPanel;
  private readonly panel: WebviewPanel;

  static createOrShow(context: ExtensionContext, onInitialize: InitializeCallback): void {
    if (DBFlowConfigPanel.currentPanel) {
      DBFlowConfigPanel.currentPanel.panel.reveal();
      return;
    }

    const panel = window.createWebviewPanel(
      "dbFlowConfig",
      "dbFlow Configuration",
      ViewColumn.One,
      { enableScripts: true }
    );

    DBFlowConfigPanel.currentPanel = new DBFlowConfigPanel(panel, context, onInitialize);
  }

  private constructor(panel: WebviewPanel, context: ExtensionContext, onInitialize: InitializeCallback) {
    this.panel = panel;

    panel.onDidDispose(() => {
      DBFlowConfigPanel.currentPanel = undefined;
    });

    panel.webview.onDidReceiveMessage(async (msg) => {
      await this.handleMessage(msg, context, onInitialize);
    });

    this.getHtml(panel.webview).then(html => {
      panel.webview.html = html;
    });
  }

  private async getHtml(_webview: Webview): Promise<string> {
    const state = this.readState();
    const ctx = {
      ...state,
      generateModeIsGenerate: state.generateMode === "generate",
      generateModeIsEnvOnly: state.generateMode === "envOnly",
      generateModeIsApplyOnly: state.generateMode === "applyOnly",
      connModeIsRest: state.connMode === "REST",
      projectModeIsSingle: state.projectType === "SINGLE",
      projectModeIsMulti: state.projectType === "MULTI",
      projectModeIsFlex: state.projectType === "FLEX",
      changelogEnabled: state.createChangelogs === "Yes",
      includeDefaultToolsEnabled: state.includeDefaultTools === "Yes",
      doNotClearEnabled: state.doNotClearSchemaOnInit === "YES",
      restUsesOauthEnabled: state.restUsesOauth !== "FALSE",
      sqlcliIsSqlcl: state.sqlcli === "sqlcl",
      dbAdminPwd: state.dbAdminPwd ? PWD_MASK : "",
      dbAppPwd: state.dbAppPwd ? PWD_MASK : "",
      restOauthBasicB64: state.restOauthBasicB64 ? PWD_MASK : "",
      buildEnvExists: fs.existsSync(this.buildEnvPath()),
      isExistingDBFlowProject: this.isExistingDBFlowProject(),
    };

    const tmplPath = path.resolve(__dirname, "..", "..", "dist", "templates", "dbflow_config.tmpl.html")
      .split(path.sep).join("/");
    const template = Handlebars.compile(fs.readFileSync(tmplPath, "utf8"));
    return template(ctx);
  }

  private async handleMessage(msg: any, context: ExtensionContext, onInitialize: InitializeCallback): Promise<void> {
    if (msg.command !== "save" && msg.command !== "saveAndInitialize") {
      return;
    }

    const previous = this.readState();
    const state = this.normalizeMessage(msg, previous);
    const validationError = this.validateState(state, msg.command === "saveAndInitialize");

    if (validationError) {
      this.panel.webview.postMessage({ type: "saveResult", success: false, message: validationError });
      return;
    }

    this.writeEnvFiles(state, previous);
    this.panel.webview.postMessage({ type: "saveResult", success: true, message: "dbFlow configuration saved." });

    if (msg.command === "saveAndInitialize" && state.applyOnly !== "YES") {
      await onInitialize(state);
      return;
    }

    const sel = await window.showInformationMessage("dbFlow configuration saved.", "Reload Window");
    if (sel) {
      commands.executeCommand("workbench.action.reloadWindow");
    }
  }

  private readState(): State & { generateMode: string } {
    const build = this.readEnvFile(this.buildEnvPath());
    const apply = this.readEnvFile(this.applyEnvPath());
    const projectName = build.PROJECT || workspace.name || "myproject";
    const connMode = this.normalizeConnMode(apply.CONN_MODE || "SQLNET");
    const projectType = connMode === "REST" ? "SINGLE" : this.normalizeProjectMode(build.PROJECT_MODE || "SINGLE");
    const restWorkspace = apply.REST_WORKSPACE || build.WORKSPACE || projectName;
    const restSqlUrl = apply.REST_SQL_URL || "";
    const restOauthTokenUrl = apply.REST_OAUTH_TOKEN_URL || "";

    return {
      title: "dbFlow Configuration",
      step: 0,
      totalSteps: 0,
      generateMode: "generate",
      connMode,
      projectName,
      projectType,
      buildBranch: build.BUILD_BRANCH || "build",
      createChangelogs: build.CHANGELOG_SCHEMA ? "Yes" : "No",
      changeLogSchema: build.CHANGELOG_SCHEMA || this.defaultChangelogSchema(projectName, projectType),
      dbConnection: apply.DB_TNS || "localhost:1521/freepdb1",
      dbAdminUser: apply.DB_ADMIN_USER || "sys",
      dbAdminPwd: this.decodePasswordValue(apply.DB_ADMIN_PWD || ""),
      dbAppUser: apply.DB_APP_USER || this.defaultDbAppUser(projectName, projectType),
      dbAppPwd: this.decodePasswordValue(apply.DB_APP_PWD || ""),
      depotPath: apply.DEPOT_PATH || "_depot",
      stageBranch: apply.STAGE || "develop",
      sqlcli: apply.SQLCLI || "sqlplus",
      includeDefaultTools: "Yes",
      defaultApps: "",
      defaulsModules: "",
      logtopath: apply.LOG_PATH || "_logs",
      doNotClearSchemaOnInit: this.normalizeYesNo(apply.DO_NOT_CLEAR_SCHEMA_ON_INIT || "NO"),
      envOnly: "NO",
      applyOnly: "NO",
      restWorkspace,
      restAppSchema: apply.REST_APP_SCHEMA || build.APP_SCHEMA || projectName,
      restUrlPrefix: this.resolveRestUrlPrefix(restSqlUrl, restOauthTokenUrl, restWorkspace),
      restSqlUrl,
      restOauthTokenUrl,
      restAppIdMap: apply.REST_APP_ID_MAP || "",
      restOauthBasicB64: apply.REST_OAUTH_BASIC_B64 || "",
      restUsesOauth: (apply.REST_USES_OAUTH || "TRUE").toUpperCase() === "FALSE" ? "FALSE" : "TRUE",
    };
  }

  private normalizeMessage(msg: any, previous: State): State {
    const projectName = (msg.projectName || previous.projectName || workspace.name || "myproject").trim();
    const connMode = this.normalizeConnMode(msg.connMode || previous.connMode);
    const projectType = connMode === "REST" ? "SINGLE" : this.normalizeProjectMode(msg.projectType || previous.projectType);
    const restUrlPrefix = this.trimTrailingSlash(msg.restUrlPrefix || previous.restUrlPrefix || "");
    const restWorkspace = (msg.restWorkspace || previous.restWorkspace || projectName).trim();
    const restSqlUrl = restUrlPrefix ? `${restUrlPrefix}/${restWorkspace}/dbflow/deploy` : (msg.restSqlUrl || previous.restSqlUrl || "");
    const restOauthTokenUrl = restUrlPrefix ? `${restUrlPrefix}/oauth/token` : (msg.restOauthTokenUrl || previous.restOauthTokenUrl || "");
    const generateMode = msg.generateMode || "generate";

    return {
      title: "dbFlow Configuration",
      step: 0,
      totalSteps: 0,
      connMode,
      projectName,
      projectType,
      buildBranch: msg.buildBranch || previous.buildBranch || "build",
      createChangelogs: msg.createChangelogs ? "Yes" : "No",
      changeLogSchema: msg.changeLogSchema || this.defaultChangelogSchema(projectName, projectType),
      dbConnection: msg.dbConnection || previous.dbConnection || "localhost:1521/freepdb1",
      dbAdminUser: msg.dbAdminUser || previous.dbAdminUser || "sys",
      dbAdminPwd: this.unmaskPassword(msg.dbAdminPwd, previous.dbAdminPwd),
      dbAppUser: msg.dbAppUser || this.defaultDbAppUser(projectName, projectType),
      dbAppPwd: this.unmaskPassword(msg.dbAppPwd, previous.dbAppPwd),
      depotPath: msg.depotPath || previous.depotPath || "_depot",
      stageBranch: msg.stageBranch || previous.stageBranch || "develop",
      sqlcli: msg.sqlcli || previous.sqlcli || "sqlplus",
      includeDefaultTools: msg.includeDefaultTools ? "Yes" : "No",
      defaultApps: msg.defaultApps || "",
      defaulsModules: msg.defaulsModules || "",
      logtopath: msg.logtopath || previous.logtopath || "_logs",
      doNotClearSchemaOnInit: msg.doNotClearSchemaOnInit ? "YES" : "NO",
      envOnly: generateMode === "envOnly" ? "YES" : "NO",
      applyOnly: generateMode === "applyOnly" ? "YES" : "NO",
      restWorkspace,
      restAppSchema: msg.restAppSchema || previous.restAppSchema || projectName,
      restUrlPrefix,
      restSqlUrl,
      restOauthTokenUrl,
      restAppIdMap: msg.restAppIdMap || "",
      restOauthBasicB64: this.unmaskPassword(msg.restOauthBasicB64, previous.restOauthBasicB64),
      restUsesOauth: msg.restUsesOauth ? "TRUE" : "FALSE",
    };
  }

  private validateState(state: State, shouldInitialize: boolean): string | undefined {
    if (!this.isValidName(state.projectName)) {
      return "Project name must start with a letter, contain only letters, numbers, and underscores, and be at least 3 characters.";
    }
    if (state.connMode !== "SQLNET" && state.connMode !== "REST") {
      return "Connection mode must be SQLNET or REST.";
    }
    if (state.connMode === "REST" && state.projectType !== "SINGLE") {
      return "REST mode supports only SingleSchema projects.";
    }
    if (!state.buildBranch || !state.depotPath || !state.stageBranch || !state.sqlcli || !state.logtopath) {
      return "Build branch, depot path, stage, SQLCLI, and log path are required.";
    }
    if (state.applyOnly === "YES" && !fs.existsSync(this.buildEnvPath())) {
      return "Apply.env only mode requires an existing build.env.";
    }
    if (state.connMode === "SQLNET" && (!state.dbConnection || !state.dbAppUser || !state.dbAdminUser)) {
      return "SQLNET mode requires DB connection, deployment user, and admin user.";
    }
    if (state.connMode === "REST" && (!state.restSqlUrl || !state.restOauthTokenUrl || !state.restWorkspace || !state.restAppSchema || !state.restOauthBasicB64)) {
      return "REST mode requires REST URLs, workspace, app schema, and OAuth Basic B64.";
    }
    if (shouldInitialize && state.applyOnly === "YES") {
      return "Apply.env only mode can only be saved, not initialized.";
    }

    return undefined;
  }

  private writeEnvFiles(state: State, previous: State): void {
    if (state.applyOnly !== "YES") {
      fs.writeFileSync(this.buildEnvPath(), this.renderBuildEnv(state));
    }
    fs.writeFileSync(this.applyEnvPath(), this.renderApplyEnv(state, previous));
  }

  private renderBuildEnv(state: State): string {
    const lines = [
      "# project name",
      `PROJECT=${state.projectName}`,
      "",
      "",
    ];

    if (state.projectType === "MULTI") {
      lines.push(
        "# In MultiSchema Mode, we have a classic 3 Tier model",
        "PROJECT_MODE=MULTI",
        `APP_SCHEMA=${state.projectName}_app`,
        `DATA_SCHEMA=${state.projectName}_data`,
        `LOGIC_SCHEMA=${state.projectName}_logic`,
      );
    } else if (state.projectType === "FLEX") {
      lines.push(
        "# In FlexSchema Mode, you have to create the schemas by your own",
        "# and don't forget to grant connect through proxy_user ",
        "PROJECT_MODE=FLEX",
      );
    } else {
      lines.push(
        "# In SingleSchema Mode, we have a only one schema",
        "PROJECT_MODE=SINGLE",
        `APP_SCHEMA=${state.projectName}`,
      );
    }

    if (state.projectType !== "FLEX") {
      lines.push("", "", "# workspace app belongs to", `WORKSPACE=${state.projectName}`, "");
    }

    lines.push(
      "",
      "# Name of the branch, where release tests are build",
      `BUILD_BRANCH=${state.buildBranch}`,
      "",
      "",
      "# Generate a changelog with these settings",
      "# When template.sql file found in reports/changelog then it will be",
      "# executed on apply with the CHANGELOG_SCHEMA .",
      "# The changelog itself is structured using INTENT_PREFIXES to look",
      "# for in commits and to place them in corresponding INTENT_NAMES inside",
      "# the file itself. You can define a regexp in TICKET_MATCH to look for",
      "# keys to link directly to your ticketsystem using TICKET_URL",
    );

    if (state.createChangelogs === "Yes") {
      lines.push(
        `CHANGELOG_SCHEMA=${state.changeLogSchema}`,
        "INTENT_PREFIXES=( Feat Fix )",
        "INTENT_NAMES=( Features Fixes )",
        "INTENT_ELSE=\"Others\"",
        "TICKET_MATCH=\"[A-Z]\\+-[0-9]\\+\"",
        "TICKET_URL=\"https://url-to-your-issue-tracker-like-jira/browse\"",
      );
    } else {
      lines.push(
        "# copy template to reports/changelog folder",
        "# cp .dbFlow/scripts/changelog_template.sql reports/changelog/template.sql",
        "# CHANGELOG_SCHEMA=PROCESSING_SCHEMA",
        "# INTENT_PREFIXES=( Feat Fix )",
        "# INTENT_NAMES=( Features Fixes )",
        "# INTENT_ELSE=\"Others\"",
        "# TICKET_MATCH=\"[A-Z]\\+-[0-9]\\+\"",
        "# TICKET_URL=\"https://url-to-your-issue-tracker-like-jira/browse\"",
      );
    }

    lines.push("", "# Set a personal reminder, which will ask you to proceed", "REMIND_ME=\"\"", "");
    return lines.join("\n");
  }

  private renderApplyEnv(state: State, previous: State): string {
    const lines = ["# Connection Mode", `CONN_MODE=${state.connMode}`, ""];

    if (state.connMode === "REST") {
      lines.push(
        "# REST Connection",
        `REST_SQL_URL=${state.restSqlUrl}`,
        `REST_APP_SCHEMA=${state.restAppSchema}`,
        `REST_WORKSPACE=${state.restWorkspace}`,
      );
      if (state.restAppIdMap) {
        lines.push(`REST_APP_ID_MAP="${state.restAppIdMap}"`);
      } else {
        lines.push("# REST_APP_ID_MAP=\"1111:1111,2222:2222\"");
      }
      lines.push(
        `REST_OAUTH_TOKEN_URL=${state.restOauthTokenUrl}`,
        `REST_OAUTH_BASIC_B64=${this.preserveValue(state.restOauthBasicB64, previous.restOauthBasicB64)}`,
        `REST_USES_OAUTH=${state.restUsesOauth}`,
        "REST_PROXY=",
        "# REST_CLIENT_TOKEN=  # set to the value printed by rest_compile_api_client.sql",
        "",
      );
    } else {
      lines.push(
        "# DB Connection",
        `DB_TNS=${state.dbConnection}`,
        "",
        "# Deployment User",
        `DB_APP_USER=${state.dbAppUser}`,
        `DB_APP_PWD=${this.encodePasswordValue(state.dbAppPwd, previous.dbAppPwd)}`,
        "",
        "# SYS/ADMIN Pass",
        `DB_ADMIN_USER=${state.dbAdminUser}`,
        `DB_ADMIN_PWD=${this.encodePasswordValue(state.dbAdminPwd, previous.dbAdminPwd)}`,
        "",
      );
    }

    lines.push(
      "# Path to Depot",
      `DEPOT_PATH=${state.depotPath}`,
      "",
      "# Stage mapped to source branch ( develop test master )",
      "# this is used to get artifacts from depot_path",
      `STAGE=${state.stageBranch}`,
      "",
      "",
      "# ADD this to original APP-NUM",
      "APP_OFFSET=0",
      "",
      "# Scripts are executed with",
      `SQLCLI=${state.sqlcli}`,
      "",
      "# On init deployments skip clearing target schema(s)",
      `DO_NOT_CLEAR_SCHEMA_ON_INIT=${state.doNotClearSchemaOnInit}`,
      "",
      "# TEAMS Channel to Post to on success",
      "TEAMS_WEBHOOK_URL=",
      "",
      "# Path to pace logs and artifacts into after installation",
      `LOG_PATH=${state.logtopath}`,
      "",
      "# List of Environment Vars to inject into global hooks, separated by colons",
      "# VAR_LIST=\"LOG_PATH:STAGE:DEPOT_PATH\"",
      "",
    );

    return lines.join("\n");
  }

  private readEnvFile(file: string): DBFlowEnv {
    if (!fs.existsSync(file)) {
      return {};
    }

    return dotenv.parse(fs.readFileSync(file));
  }

  private buildEnvPath(): string {
    return path.join(getWorkspaceRootPath(), "build.env");
  }

  private applyEnvPath(): string {
    return path.join(getWorkspaceRootPath(), "apply.env");
  }

  private isExistingDBFlowProject(): boolean {
    return fs.existsSync(this.buildEnvPath()) && fs.existsSync(this.applyEnvPath());
  }

  private normalizeConnMode(value: string): string {
    const mode = (value || "SQLNET").toUpperCase();
    return mode === "REST" ? "REST" : "SQLNET";
  }

  private normalizeProjectMode(value: string): string {
    const mode = (value || "SINGLE").toUpperCase();
    if (mode === "M" || mode === "MULTI") {
      return "MULTI";
    }
    if (mode === "F" || mode === "FLEX") {
      return "FLEX";
    }
    return "SINGLE";
  }

  private normalizeYesNo(value: string): string {
    return ["Y", "YES"].includes((value || "NO").toUpperCase()) ? "YES" : "NO";
  }

  private defaultDbAppUser(projectName: string, projectType: string): string {
    return projectType === "SINGLE" ? projectName : `${projectName}_depl`;
  }

  private defaultChangelogSchema(projectName: string, projectType: string): string {
    return projectType === "SINGLE" ? projectName : `${projectName}_app`;
  }

  private resolveRestUrlPrefix(restSqlUrl: string, restOauthTokenUrl: string, restWorkspace: string): string {
    const sqlSuffix = `/${restWorkspace}/dbflow/deploy`;
    if (restSqlUrl && restWorkspace && restSqlUrl.endsWith(sqlSuffix)) {
      return restSqlUrl.substring(0, restSqlUrl.length - sqlSuffix.length);
    }
    if (restOauthTokenUrl && restOauthTokenUrl.endsWith("/oauth/token")) {
      return restOauthTokenUrl.substring(0, restOauthTokenUrl.length - "/oauth/token".length);
    }
    return "";
  }

  private trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, "");
  }

  private isValidName(value: string): boolean {
    return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(value) && value.length >= 3;
  }

  private unmaskPassword(value: string, previous: string): string {
    if (!value || value === PWD_MASK) {
      return previous || "";
    }
    return value;
  }

  private preserveValue(value: string, previous: string): string {
    if (!value || value === PWD_MASK) {
      return previous === PWD_MASK ? "" : previous;
    }
    return value;
  }

  private encodePasswordValue(value: string, previous: string): string {
    const resolved = this.preserveValue(value, previous);
    if (!resolved) {
      return "";
    }
    if (resolved.startsWith("\"!")) {
      return resolved;
    }
    return `"!${Buffer.from(resolved).toString("base64")}"`;
  }

  private decodePasswordValue(value: string): string {
    const unquoted = value.replace(/^"|"$/g, "");
    if (unquoted.startsWith("!")) {
      return Buffer.from(unquoted.substring(1), "base64").toString("utf8").replace(/\n$/, "");
    }
    return unquoted;
  }

  dispose(): void {
    this.panel.dispose();
  }
}
