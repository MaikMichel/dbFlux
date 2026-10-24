import * as assert from 'assert';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';

import { IProjectInfos, decodeEnvValue, getProjectInfosFromDBFlow } from '../../provider/AbstractBashTaskProvider';
import { CompileTaskStore } from '../../stores/CompileTaskStore';
import { getPassword } from '../../helper/utilities';
import { buildEnvKeys, mergeEnvFile } from '../../ui/DBFlowConfigPanel';
import { getRestServerInfo } from '../../helper/RestApiUtils';

const shellDir = path.resolve(__dirname, '../../../dist/shell');

function startServer(status: number, contentType: string, body: string): Promise<http.Server> {
	return new Promise(resolve => {
		const server = http.createServer((_req, res) => {
			res.writeHead(status, { 'Content-Type': contentType });
			res.end(body);
		});
		server.listen(0, '127.0.0.1', () => resolve(server));
	});
}

function runRestPostJson(url: string) {
	return new Promise<{ code: number, stdout: string }>(resolve => {
		execFile('bash', ['-c',
			'source "$1/_lib.sh"; source "$1/_rest_lib.sh"; ensure_rest_access_token() { REST_ACCESS_TOKEN=token; }; ' +
			'REST_SQL_URL="$2"; REST_CONNECT_TIMEOUT=5; REST_COMPILE_MAX_TIME=10; rest_post_json compileschema; ' +
			'rc=$?; echo "rc=$rc errors=$REST_ERRORS_FOUND body=$REST_LAST_RESPONSE"; exit $rc',
			'test', shellDir, url], (error, stdout) => {
			resolve({ code: error ? (error as any).code ?? 1 : 0, stdout: stdout.toString() });
		});
	});
}

suite('REST HTTP status handling', () => {
	test('rest_post_json fails on a non-JSON error page', async () => {
		const server = await startServer(502, 'text/html', '<html>Bad Gateway</html>');
		try {
			const result = await runRestPostJson(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
			assert.notStrictEqual(result.code, 0);
			assert.match(result.stdout, /errors=1/);
		} finally {
			server.close();
		}
	});

	test('rest_post_json keeps a JSON error body for the caller', async () => {
		const server = await startServer(400, 'application/json', '{"success":false}');
		try {
			const result = await runRestPostJson(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
			assert.strictEqual(result.code, 0);
			assert.match(result.stdout, /body=\{"success":false\}/);
		} finally {
			server.close();
		}
	});

	test('rest_post_json succeeds on a 200 JSON response and strips the status line', async () => {
		const server = await startServer(200, 'application/json', '{"success":true}');
		try {
			const result = await runRestPostJson(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
			assert.strictEqual(result.code, 0);
			assert.match(result.stdout, /errors=0 body=\{"success":true\}$/m);
		} finally {
			server.close();
		}
	});
});

suite('dbFlow ^NAME expansion order', () => {
	test('replaces the longer variable name first when one name is a prefix of another', async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbflux-prefix-'));
		const sourcePath = path.join(tempDir, 'source.sql');
		const expandedPath = path.join(tempDir, 'expanded.sql');
		try {
			fs.writeFileSync(sourcePath, 'prompt ^APP_NAME ^APP;\n');
			await new Promise<void>((resolve, reject) => {
				execFile('bash', ['-c', 'source "$1/_lib.sh"; dbflow_expand_sql_file "$2" "$3"', 'test', shellDir, sourcePath, expandedPath],
					{ env: { ...process.env, DBFLOW_VAR_LIST: 'APP:APP_NAME', DBFLOW_VAR_APP: 'a', DBFLOW_VAR_APP_NAME: 'long' } },
					error => error ? reject(error) : resolve());
			});
			assert.strictEqual(fs.readFileSync(expandedPath, 'utf8'), 'prompt long a;\n');
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

suite('mergeEnvFile', () => {
	const rendered = ['PROJECT=demo', 'APP_OFFSET=0', 'TEAMS_WEBHOOK_URL=', '# VAR_LIST="LOG_PATH"', 'DEPOT_PATH=_depot', ''].join('\n');

	test('returns the rendered template when there is no existing file', () => {
		assert.strictEqual(mergeEnvFile(rendered, undefined, ['PROJECT', 'DEPOT_PATH'], ['APP_OFFSET']), rendered);
	});

	test('keeps existing values of preserved keys, also over a commented default', () => {
		const existing = 'APP_OFFSET=100\nTEAMS_WEBHOOK_URL=https://hook\nVAR_LIST="STAGE:LOG_PATH"\n';
		const merged = mergeEnvFile(rendered, existing, ['PROJECT', 'DEPOT_PATH'], ['APP_OFFSET', 'TEAMS_WEBHOOK_URL', 'VAR_LIST']);

		assert.match(merged, /^APP_OFFSET=100$/m);
		assert.match(merged, /^TEAMS_WEBHOOK_URL=https:\/\/hook$/m);
		assert.match(merged, /^VAR_LIST="STAGE:LOG_PATH"$/m);
		assert.doesNotMatch(merged, /# VAR_LIST/);
	});

	test('appends unknown keys but drops managed keys that are no longer rendered', () => {
		const existing = 'dbFlux_SCHEMA_PWD=secret\nREST_HEADER_X=x\nDB_TNS=old\nDEPOT_PATH=changed\n';
		const merged = mergeEnvFile(rendered, existing, ['PROJECT', 'DEPOT_PATH', 'DB_TNS'], []);

		assert.match(merged, /^dbFlux_SCHEMA_PWD=secret$/m);
		assert.match(merged, /^REST_HEADER_X=x$/m);
		assert.doesNotMatch(merged, /DB_TNS/);
		assert.match(merged, /^DEPOT_PATH=_depot$/m);
		assert.doesNotMatch(merged, /DEPOT_PATH=changed/);
	});

	test('appends a preserved key that the template does not render', () => {
		const merged = mergeEnvFile('PROJECT=demo\n', 'REST_PROXY=http://proxy\n', ['PROJECT'], ['REST_PROXY']);
		assert.match(merged, /^REST_PROXY=http:\/\/proxy$/m);
	});
});

suite('decodeEnvValue', () => {
	test('returns plain values unchanged', () => {
		assert.strictEqual(decodeEnvValue('plain'), 'plain');
	});

	test('decodes base64 values and strips all trailing newlines', () => {
		assert.strictEqual(decodeEnvValue('!' + Buffer.from('secret\n').toString('base64')), 'secret');
		assert.strictEqual(decodeEnvValue('!' + Buffer.from('secret\r\n\r\n').toString('base64')), 'secret');
	});

	test('keeps newlines inside the value', () => {
		assert.strictEqual(decodeEnvValue('!' + Buffer.from('a\nb').toString('base64')), 'a\nb');
	});
});

suite('getPassword in REST mode', () => {
	const context = { workspaceState: { get: () => 'dbFlux' } } as any;
	const restInfos = (dbAppPwd: string | undefined) => ({
		dbConnMode: 'REST', dbAppPwd, dbAdminUser: 'admin', dbPasses: undefined,
	}) as unknown as IProjectInfos;
	let savedPwd: string | undefined;

	setup(() => { savedPwd = CompileTaskStore.getInstance().appPwd; });
	teardown(() => { CompileTaskStore.getInstance().appPwd = savedPwd; });

	test('uses the stored credential', () => {
		CompileTaskStore.getInstance().appPwd = 'typed';
		assert.strictEqual(getPassword(restInfos('stored'), 'app', false, context), 'stored');
	});

	test('falls back to the API key entered at the prompt', () => {
		CompileTaskStore.getInstance().appPwd = 'typed';
		assert.strictEqual(getPassword(restInfos(undefined), 'app', false, context), 'typed');
	});
});

suite('REST token request', () => {
	let savedPwd: string | undefined;
	setup(() => { savedPwd = CompileTaskStore.getInstance().appPwd; });
	teardown(() => { CompileTaskStore.getInstance().appPwd = savedPwd; });

	// serves the token endpoint and GET /compile, records the Basic header of the token request
	function startOAuthServer(): Promise<{ server: http.Server, url: string, auth: string[] }> {
		return new Promise(resolve => {
			const auth: string[] = [];
			const server = http.createServer((req, res) => {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				if (req.method === 'POST') {
					auth.push(String(req.headers.authorization));
					res.end(JSON.stringify({ access_token: 'tok' }));
				} else {
					res.end(JSON.stringify({ success: true, version: '1.1.0', api_level: 1 }));
				}
			});
			server.listen(0, '127.0.0.1', () => {
				const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
				resolve({ server, url, auth });
			});
		});
	}

	const infos = (url: string, dbAppPwd: string | undefined) => ({
		dbConnMode: 'REST', dbAppPwd, restSqlUrl: `${url}/sql`, restOauthTokenUrl: `${url}/token`,
	}) as unknown as IProjectInfos;

	test('sends the stored credential', async () => {
		const { server, url, auth } = await startOAuthServer();
		try {
			CompileTaskStore.getInstance().appPwd = 'typed';
			await getRestServerInfo(infos(url, 'stored'));
			assert.deepStrictEqual(auth, ['Basic stored']);
		} finally { server.close(); }
	});

	test('sends the API key entered at the prompt when nothing is stored', async () => {
		const { server, url, auth } = await startOAuthServer();
		try {
			CompileTaskStore.getInstance().appPwd = 'typed';
			const info = await getRestServerInfo(infos(url, undefined));
			assert.deepStrictEqual(auth, ['Basic typed']);
			assert.strictEqual(info.apiLevel, 1);
		} finally { server.close(); }
	});

	test('fails without a request when no API key is available', async () => {
		const { server, url, auth } = await startOAuthServer();
		try {
			CompileTaskStore.getInstance().appPwd = undefined;
			await assert.rejects(getRestServerInfo(infos(url, undefined)), /No API key available/);
			assert.deepStrictEqual(auth, []);
		} finally { server.close(); }
	});
});

suite('build.env key ownership', () => {
	test('keeps a hand-maintained WORKSPACE for FLEX projects', () => {
		const { managed, preserved } = buildEnvKeys(true);
		assert.ok(preserved.includes('WORKSPACE'));
		assert.ok(!managed.includes('WORKSPACE'));
		const merged = mergeEnvFile('PROJECT=demo\n', 'PROJECT=demo\nWORKSPACE=myws\n', managed, preserved);
		assert.match(merged, /^WORKSPACE=myws$/m);
	});

	test('manages WORKSPACE for SINGLE and MULTI projects', () => {
		const { managed, preserved } = buildEnvKeys(false);
		assert.ok(managed.includes('WORKSPACE'));
		assert.ok(!preserved.includes('WORKSPACE'));
	});
});

suite('rest_compile.sh exit code', () => {
	test('exits non-zero when the SQL file cannot be run', done => {
		execFile('bash', [path.join(shellDir, 'rest_compile.sh')], {
			env: { ...process.env, DBFLOW_FILE: 'missing.sql', DBFLOW_WSPACE: path.join(os.tmpdir(), 'dbflux-missing.sql') }
		}, (error, stdout) => {
			assert.ok(error, 'script must not report success');
			assert.notStrictEqual((error as any).code, 0);
			assert.match(stdout.toString(), /does not exist/);
			done();
		});
	});
});

suite('dbFlow project infos without apply.env', () => {
	const context = { workspaceState: { keys: () => [] }, secrets: { get: async () => undefined } } as any;
	let dir: string;

	setup(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbflux-projinfos-'));
		fs.writeFileSync(path.join(dir, 'build.env'), 'PROJECT=demo\nPROJECT_MODE=SINGLE\nAPP_SCHEMA=demo\n');
	});
	teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

	test('defaults to SQLNET and flags the missing connection as invalid', async () => {
		const infos = await getProjectInfosFromDBFlow(context, dir);
		assert.strictEqual(infos.dbConnMode, 'SQLNET');
		assert.strictEqual(infos.isValid, false);
	});

	test('is valid once apply.env provides user and TNS', async () => {
		fs.writeFileSync(path.join(dir, 'apply.env'), 'DB_APP_USER=demo\nDB_TNS=localhost:1521/xepdb1\n');
		const infos = await getProjectInfosFromDBFlow(context, dir);
		assert.strictEqual(infos.dbConnMode, 'SQLNET');
		assert.strictEqual(infos.isValid, true);
	});
});
