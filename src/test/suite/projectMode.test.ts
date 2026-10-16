import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { inferProjectMode } from '../../provider/AbstractBashTaskProvider';

function createDbFolder(schemaFolders: string[]): string {
	const dbFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'dbflux-db-'));
	for (const folder of schemaFolders) {
		fs.mkdirSync(path.join(dbFolder, folder));
	}
	return dbFolder;
}

suite('Project mode inference', () => {
	test('uses SINGLE when the db folder does not exist', () => {
		assert.strictEqual(inferProjectMode(path.join(os.tmpdir(), 'dbflux-missing-db-folder')), 'SINGLE');
	});

	test('uses SINGLE for one schema folder and ignores setup folders', () => {
		assert.strictEqual(inferProjectMode(createDbFolder(['proj', '_setup', '.hooks'])), 'SINGLE');
	});

	test('uses MULTI for three schema folders', () => {
		assert.strictEqual(inferProjectMode(createDbFolder(['proj_data', 'proj_logic', 'proj_app', '_setup'])), 'MULTI');
	});

	test('uses FLEX for any other number of schema folders', () => {
		assert.strictEqual(inferProjectMode(createDbFolder(['one', 'two'])), 'FLEX');
		assert.strictEqual(inferProjectMode(createDbFolder(['one', 'two', 'three', 'four'])), 'FLEX');
	});
});
