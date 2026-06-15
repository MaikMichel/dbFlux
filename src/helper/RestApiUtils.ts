import fetch from "node-fetch";
import { commands, window } from "vscode";
import { IProjectInfos } from "../provider/AbstractBashTaskProvider";
import { ConfigurationManager } from "./ConfigurationManager";
import { LoggingService } from "./LoggingService";
import { rtrim } from "./utilities";

export interface IRestServerInfo {
  apiLevel: number;
  version: string | undefined;
}

interface ICachedServerInfo extends IRestServerInfo {
  fetchedAt: number;
}

// short TTL so a server upgrade is picked up without reloading the extension
const CACHE_TTL_MS = 60 * 1000;
const serverInfoCache: Map<string, ICachedServerInfo> = new Map();

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function fetchAccessToken(projectInfos: IProjectInfos): Promise<string> {
  const tokenMaxMs = ConfigurationManager.getRestCompileTokenMaxTime() * 1000;
  LoggingService.logDebug(projectInfos.restOauthTokenUrl!, projectInfos.dbAppPwd);
  const response = await withTimeout(
    fetch(projectInfos.restOauthTokenUrl!, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${projectInfos.dbAppPwd}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    }),
    tokenMaxMs,
    "OAuth token request"
  );
  LoggingService.logDebug("Response", response);
  if (!response.ok) {
    throw new Error(`Token request failed with status ${response.status}`);
  }

  const data: any = await response.json();
  if (!data.access_token) {
    throw new Error("OAuth token response did not contain access_token");
  }

  return data.access_token;
}

// Reads version and api_level from GET <restSqlUrl>/compile.
// Servers installed before rest_compile 1.1.0 return only {"success": true},
// which maps to api_level 0 (compile/impapp only).
export async function getRestServerInfo(projectInfos: IProjectInfos): Promise<IRestServerInfo> {
  const baseUrl = rtrim(projectInfos.restSqlUrl!, "/");

  const cached = serverInfoCache.get(baseUrl);
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached;
  }

  const token = await fetchAccessToken(projectInfos);
  const compileMaxMs = ConfigurationManager.getRestCompileCompileMaxTime() * 1000;
  const response = await withTimeout(
    fetch(`${baseUrl}/compile`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` }
    }),
    compileMaxMs,
    "REST compile endpoint request"
  );

  if (!response.ok) {
    throw new Error(`Request to ${baseUrl}/compile failed with status ${response.status}`);
  }

  const data: any = await response.json();
  const info: ICachedServerInfo = {
    apiLevel: typeof data.api_level === "number" ? data.api_level : 0,
    version: data.version,
    fetchedAt: Date.now()
  };
  serverInfoCache.set(baseUrl, info);

  LoggingService.logInfo(`rest_compile server info: version=${info.version ?? "unknown"}, api_level=${info.apiLevel}`);
  return info;
}

// Gate for all REST commands beyond plain file compile: verifies that the
// installed rest_compile package provides the required api level and points
// the user to the install guide otherwise.
export async function assertRestApiLevel(projectInfos: IProjectInfos, featureLabel: string, requiredLevel: number = 1): Promise<boolean> {
  try {
    const info = await getRestServerInfo(projectInfos);
    if (info.apiLevel >= requiredLevel) {
      return true;
    }

    window.showErrorMessage(
      `dbFlux: '${featureLabel}' over REST requires the rest_compile package v1.1+ on the server ` +
      `(installed: ${info.version ?? "pre 1.1.0"}). Please re-run the install script to upgrade.`,
      "Show Install Guide"
    ).then(selection => {
      if (selection) {
        commands.executeCommand("dbFlux.showRESTCompileGuide");
      }
    });
    return false;
  } catch (err: any) {
    LoggingService.logError(`rest_compile server info check failed: ${err}`, err);
    window.showErrorMessage(`dbFlux: Could not reach the REST endpoint (${err.message ?? err}). Please check your REST configuration.`);
    return false;
  }
}

// Connectivity check for user-triggered verification (e.g. status bar click).
// Shows a notification with the result instead of gating silently.
export async function checkRestConnectivity(projectInfos: IProjectInfos): Promise<void> {
  LoggingService.logInfo("Checking REST API connectivity...");
  try {
    const info = await getRestServerInfo(projectInfos);
    const msg = `REST API reachable — version: ${info.version ?? "pre 1.1.0"}, api_level: ${info.apiLevel}`;
    LoggingService.logInfo(msg);
    window.showInformationMessage(`dbFlux: ${msg}`);
  } catch (err: any) {
    const msg = `REST API not reachable: ${err.message ?? err}`;
    LoggingService.logError(msg, err);
    window.showErrorMessage(
      `dbFlux: ${msg}. Please check your REST configuration.`,
      "Show Install Guide"
    ).then(sel => {
      if (sel) {
        commands.executeCommand("dbFlux.showRESTCompileGuide");
      }
    });
  }
}
