import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { inferProjectMode, resolveProjectMode, stripNumericPrefix } from '../../provider/AbstractBashTaskProvider';

const multiSchemas = { appSchema: 'proj_app', logicSchema: 'proj_logic', dataSchema: 'proj_data' };

suite('Project mode inference', () => {
	let tmpRoot: string;

	setup(() => {
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dbflux-mode-'));
	});

	teardown(() => {
		fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	function createDbFolder(schemaFolders: string[], name = 'db'): string {
		const dbFolder = path.join(tmpRoot, name);
		fs.mkdirSync(dbFolder);
		for (const folder of schemaFolders) {
			fs.mkdirSync(path.join(dbFolder, folder));
		}
		return dbFolder;
	}

	test('uses SINGLE when the db folder does not exist', () => {
		assert.strictEqual(inferProjectMode(path.join(tmpRoot, 'db')), 'SINGLE');
	});

	test('uses SINGLE when the db folder is not readable as a directory', () => {
		const dbFile = path.join(tmpRoot, 'db');
		fs.writeFileSync(dbFile, '');

		assert.strictEqual(inferProjectMode(dbFile), 'SINGLE');
	});

	test('uses SINGLE when there are no schema folders yet', () => {
		assert.strictEqual(inferProjectMode(createDbFolder(['_setup'])), 'SINGLE');
	});

	test('uses SINGLE for one schema folder matching the APP schema', () => {
		assert.strictEqual(inferProjectMode(createDbFolder(['PROJ', '_setup', '.hooks']), { appSchema: 'proj' }), 'SINGLE');
	});

	test('uses FLEX for one schema folder not matching the APP schema', () => {
		assert.strictEqual(inferProjectMode(createDbFolder(['hr']), { appSchema: 'proj' }), 'FLEX');
		assert.strictEqual(inferProjectMode(createDbFolder(['hr'], 'db2')), 'FLEX');
	});

	test('uses MULTI for three schema folders matching the configured schemas', () => {
		assert.strictEqual(inferProjectMode(createDbFolder(['proj_data', 'proj_logic', 'proj_app', '_setup']), multiSchemas), 'MULTI');
	});

	test('ignores leading numbers when matching schema folders', () => {
		assert.strictEqual(inferProjectMode(createDbFolder(['1_proj_data', '2_proj_logic', '3_proj_app']), multiSchemas), 'MULTI');
	});

	test('uses FLEX for three schema folders not matching the configured schemas', () => {
		assert.strictEqual(inferProjectMode(createDbFolder(['hr', 'sales', 'core']), multiSchemas), 'FLEX');
	});

	test('uses FLEX for any other number of schema folders', () => {
		assert.strictEqual(inferProjectMode(createDbFolder(['one', 'two']), multiSchemas), 'FLEX');
	});

	test('uses MULTI without schema folders when three different schemas are configured', () => {
		assert.strictEqual(inferProjectMode(path.join(tmpRoot, 'db'), multiSchemas), 'MULTI');
		assert.strictEqual(inferProjectMode(createDbFolder(['_setup']), multiSchemas), 'MULTI');
	});

	test('uses SINGLE without schema folders when the configured schemas are incomplete or equal', () => {
		assert.strictEqual(inferProjectMode(path.join(tmpRoot, 'db'), { appSchema: 'proj' }), 'SINGLE');
		assert.strictEqual(inferProjectMode(path.join(tmpRoot, 'db'), { appSchema: 'proj', logicSchema: 'proj', dataSchema: 'proj' }), 'SINGLE');
	});

	test('matches schema folders like the connection user resolution', () => {
		assert.strictEqual(stripNumericPrefix('010_data'), 'data');
		assert.strictEqual(stripNumericPrefix('2024data'), '2024data');
		assert.strictEqual(stripNumericPrefix('proj_app'), 'proj_app');
		assert.strictEqual(inferProjectMode(createDbFolder(['2024proj']), { appSchema: 'proj' }), 'FLEX');
	});

	test('resolves REST projects to SINGLE and keeps a stored mode without detection', () => {
		assert.deepStrictEqual(resolveProjectMode('FLEX', 'REST'), { projectMode: 'SINGLE', detected: false });
		assert.deepStrictEqual(resolveProjectMode(undefined, 'REST'), { projectMode: 'SINGLE', detected: false });
		assert.deepStrictEqual(resolveProjectMode('MULTI', 'SQLNET'), { projectMode: 'MULTI', detected: false });
	});
});
