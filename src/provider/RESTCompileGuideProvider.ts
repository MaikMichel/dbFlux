import * as https from "https";
import * as fs from "fs";
import { commands, Uri, ViewColumn, WebviewPanel, window } from "vscode";

let guidePanel: WebviewPanel | undefined;

export const INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/MaikMichel/dbFlow/refs/heads/develop/scripts/setup/rest_compile/install.sql";

function getWebviewHtml(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Install REST Compile Feature</title>
  <style>
    body {
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      padding: 20px 32px;
      max-width: 800px;
    }
    h1 { font-size: 1.5em; margin-bottom: 0.4em; }
    h2 { font-size: 1.1em; margin-top: 1.6em; margin-bottom: 0.3em; }
    ol { padding-left: 1.4em; }
    li { margin-bottom: 0.8em; line-height: 1.5; }
    .intro { margin-bottom: 1.2em; line-height: 1.6; }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 14px;
      cursor: pointer;
      border-radius: 2px;
      font-size: 0.95em;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .warning-box {
      background: var(--vscode-inputValidation-warningBackground, rgba(255, 200, 0, 0.15));
      border: 1px solid var(--vscode-inputValidation-warningBorder, #b89500);
      border-radius: 4px;
      padding: 10px 16px;
      margin-top: 1.4em;
      line-height: 1.6;
    }
    .warning-box strong { display: block; margin-bottom: 6px; }
    code {
      font-family: var(--vscode-editor-font-family, monospace);
      background: var(--vscode-textBlockQuote-background, rgba(127,127,127,0.1));
      padding: 1px 5px;
      border-radius: 3px;
    }
    a { color: var(--vscode-textLink-foreground); }
  </style>
</head>
<body>
  <h1>Install REST Compile Feature</h1>

  <p class="intro">
    The REST compile feature allows dbFlux to deploy database changes via a REST endpoint
    directly in your Oracle database, without requiring a direct SQLNET connection.
    To enable this, a REST endpoint must be installed in the target APEX workspace.
  </p>

  <h2>Installation Steps</h2>
  <ol>
    <li>
      <strong>Download the install script</strong><br/>
      Download the installation script and save it locally:<br/><br/>
      <button id="btnDownload">Download install-rest-compile.sql</button>
    </li>
    <li>
      <strong>Log in to your APEX Workspace</strong><br/>
      Open your APEX workspace in the browser, e.g.:<br/>
      <a href="https://oracleapex.com/ords/r/apex/workspace-sign-in" target="_blank">
        https://oracleapex.com/ords/r/apex/workspace-sign-in
      </a>
    </li>
    <li>
      <strong>SQL Workshop &rarr; SQL Scripts &rarr; Upload</strong><br/>
      Navigate to <em>SQL Workshop</em> &rarr; <em>SQL Scripts</em> and click
      <strong>Upload</strong>. Select the downloaded script, enter the name
      <code>install-rest-compile</code>, and confirm the upload.
    </li>
    <li>
      <strong>Run the script</strong><br/>
      Execute the uploaded script <code>install-rest-compile</code> using the Run button
      in the SQL Scripts section.
    </li>
  </ol>

  <div class="warning-box">
    <strong>IMPORTANT: Open the script run detail view!</strong>
    After execution, open the <strong>detail view</strong> of the script run (click on the
    result) to see the full output. It contains the following parameters required for
    further configuration:
    <ul>
      <li><code>REST_SQL_URL</code></li>
      <li><code>REST_OAUTH_TOKEN_URL</code></li>
      <li><code>REST_OAUTH_BASIC_B64</code></li>
    </ul>
    <br/>
    <strong>Note:</strong> These parameters must be stored in <code>apply.env</code>
    (for dbFlow projects) or in the <strong>VS Code workspace settings</strong>
    (for dbFlux projects).
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('btnDownload').addEventListener('click', () => {
      vscode.postMessage({ command: 'download' });
    });
  </script>
</body>
</html>`;
}

export function downloadFile(url: string, destPath: string, redirectsLeft = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    https.get(url, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        file.close(() => {
          fs.unlink(destPath, () => {});
          if (redirectsLeft <= 0) {
            reject(new Error("Too many redirects"));
            return;
          }
          downloadFile(response.headers.location!, destPath, redirectsLeft - 1).then(resolve).catch(reject);
        });
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        file.close(() => fs.unlink(destPath, () => {}));
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      file.on("error", (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });

      response.pipe(file);

      file.on("finish", () => file.close(() => resolve()));
    }).on("error", (err) => {
      file.close(() => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });
  });
}

export function registerShowRESTCompileGuide(command: string) {
  return commands.registerCommand(command, async () => {
    if (guidePanel) {
      guidePanel.reveal();
      return;
    }

    guidePanel = window.createWebviewPanel(
      "dbFlux",
      "Install REST Compile Feature",
      ViewColumn.One,
      { enableScripts: true, enableCommandUris: true }
    );

    guidePanel.onDidDispose(() => { guidePanel = undefined; });

    guidePanel.webview.html = getWebviewHtml();

    guidePanel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "download") {
        const saveUri = await window.showSaveDialog({
          defaultUri: Uri.file("install-rest-compile.sql"),
          filters: { "SQL Files": ["sql"] },
          saveLabel: "Save",
          title: "Save install-rest-compile.sql",
        });

        if (!saveUri) {
          return;
        }

        try {
          await downloadFile(INSTALL_SCRIPT_URL, saveUri.fsPath);
          window.showInformationMessage(`dbFlux: Script saved to: ${saveUri.fsPath}`);
        } catch (err: unknown) {
          window.showErrorMessage(
            `dbFlux: Failed to download script: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    });
  });
}
