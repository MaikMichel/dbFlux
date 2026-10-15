import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { parseDBFlowVariables } from '../../provider/AbstractBashTaskProvider';

suite('dbFlow VAR_LIST variables', () => {
	test('parses allowlisted variables and preserves their apply.env values', () => {
		const variables = parseDBFlowVariables(
			{
				VAR_LIST: 'STAGE:DEPOT_PATH:STAGE',
				STAGE: 'develop',
			},
				{ DEPOT_PATH: '../_depot' },
		);

		assert.deepStrictEqual(variables.names, ['STAGE', 'DEPOT_PATH']);
		assert.deepStrictEqual(variables.values, {
			STAGE: 'develop',
			DEPOT_PATH: '../_depot',
		});
	});

	test('ignores invalid names and falls back to inherited environment values', () => {
		const variables = parseDBFlowVariables(
			{
				VAR_LIST: 'STAGE:BAD-NAME:MISSING',
				STAGE: '',
			},
			{ MISSING: 'from-process' },
		);

		assert.deepStrictEqual(variables.names, ['STAGE', 'MISSING']);
		assert.deepStrictEqual(variables.values, {
			STAGE: '',
			MISSING: 'from-process',
		});
	});

	test('defines fixed compile MODE and VERSION values', () => {
		const shellPath = path.resolve(__dirname, '../../../dist/shell/_lib.sh');
		const output = execFileSync('bash', ['-c', 'source "$1"; dbflow_sql_var_defines', 'test', shellPath], {
			env: {
				...process.env,
				DBFLOW_VAR_LIST: 'MODE:VERSION:STAGE',
				DBFLOW_VAR_MODE: 'wrong-mode',
				DBFLOW_VAR_VERSION: 'wrong-version',
				DBFLOW_VAR_STAGE: 'develop',
			},
		}).toString();

		assert.match(output, /define VERSION="0\.0\.0"/);
		assert.match(output, /define MODE="patch"/);
		assert.match(output, /define STAGE="develop"/);
		assert.doesNotMatch(output, /wrong-mode|wrong-version/);
	});

	test('expands fixed compile values in REST payloads without changing the source', () => {
		const shellPath = path.resolve(__dirname, '../../../dist/shell/_lib.sh');
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbflux-vars-'));
		const sourcePath = path.join(tempDir, 'source.sql');
		const expandedPath = path.join(tempDir, 'expanded.sql');

		try {
			fs.writeFileSync(sourcePath, 'prompt ^MODE;\nprompt ^VERSION;\nprompt ^STAGE;\n');			execFileSync('bash', [
				'-c',
				'source "$1"; dbflow_expand_sql_file "$2" "$3"',
				'test',
				shellPath,
				sourcePath,
				expandedPath,
			], {
				env: {
					...process.env,
					DBFLOW_VAR_LIST: 'STAGE',
					DBFLOW_VAR_STAGE: 'develop',
				},
			});

			assert.strictEqual(fs.readFileSync(expandedPath, 'utf8'), 'prompt patch;\nprompt 0.0.0;\nprompt develop;\n');
			assert.strictEqual(fs.readFileSync(sourcePath, 'utf8'), 'prompt ^MODE;\nprompt ^VERSION;\nprompt ^STAGE;\n');
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
