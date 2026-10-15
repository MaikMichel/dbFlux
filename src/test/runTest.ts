import * as fs from 'fs';
import * as path from 'path';

import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';

function resolveVSCodeExecutablePath(downloadedPath: string): string {
    if (fs.existsSync(downloadedPath)) {
        return downloadedPath;
    }

    // New macOS VS Code archives use "Code" instead of the legacy "Electron"
    // executable name expected by @vscode/test-electron.
    if (process.platform === 'darwin') {
        const currentExecutablePath = path.join(path.dirname(downloadedPath), 'Code');
        if (fs.existsSync(currentExecutablePath)) {
            return currentExecutablePath;
        }
    }

    throw new Error(`VS Code executable not found at ${downloadedPath}`);
}

async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // The path to test runner
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // Download VS Code, unzip it and run the integration test
        const downloadedPath = await downloadAndUnzipVSCode({ extensionDevelopmentPath });
        const vscodeExecutablePath = resolveVSCodeExecutablePath(downloadedPath);
        await runTests({ vscodeExecutablePath, extensionDevelopmentPath, extensionTestsPath });
    } catch (err) {
        console.error('Failed to run tests');
        process.exit(1);
    }
}

main();
