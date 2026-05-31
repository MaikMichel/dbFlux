import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('Wrap Log Selection', () => {

	const activateExtension = async () => {
		const extension = vscode.extensions.getExtension('MaikMichel.dbflow');
		if (extension && !extension.isActive) {
			await extension.activate();
		}
	};

	test('dbFlux.wrapLogSelection replaces selection with log wrapper', async () => {
		await activateExtension();

		const doc = await vscode.workspace.openTextDocument({
			language: 'typescript',
			content: 'a',
		});
		const editor = await vscode.window.showTextDocument(doc);

		const selection = new vscode.Selection(
			new vscode.Position(0, 0),
			new vscode.Position(0, 1)
		);
		editor.selection = selection;

		await vscode.commands.executeCommand('dbFlux.wrapLogSelection');
		await new Promise((resolve) => setTimeout(resolve, 50));

		const expected = "console.log('a', a);";
		assert.strictEqual(editor.document.getText(), expected);
	});

	test('dbFlux.wrapLogSelection.down inserts log line after selection line', async () => {
		await activateExtension();

		const doc = await vscode.workspace.openTextDocument({
			language: 'typescript',
			content: 'const a = 1;',
		});
		const editor = await vscode.window.showTextDocument(doc);

		const selection = new vscode.Selection(
			new vscode.Position(0, 6),
			new vscode.Position(0, 7)
		);
		editor.selection = selection;

		await vscode.commands.executeCommand('dbFlux.wrapLogSelection.down');
		await new Promise((resolve) => setTimeout(resolve, 50));

		const expected = "const a = 1;\nconsole.log('a', a);";
		assert.strictEqual(editor.document.getText(), expected);
	});

	test('dbFlux.wrapLogSelection.up inserts log line before selection line', async () => {
		await activateExtension();

		const doc = await vscode.workspace.openTextDocument({
			language: 'typescript',
			content: 'const a = 1;',
		});
		const editor = await vscode.window.showTextDocument(doc);

		const selection = new vscode.Selection(
			new vscode.Position(0, 6),
			new vscode.Position(0, 7)
		);
		editor.selection = selection;

		await vscode.commands.executeCommand('dbFlux.wrapLogSelection.up');
		await new Promise((resolve) => setTimeout(resolve, 50));

		const expected = "console.log('a', a);\nconst a = 1;";
		assert.strictEqual(editor.document.getText(), expected);
	});
});
