import * as assert from 'assert';

import { IProjectInfos, buildConnectionUser } from '../../provider/AbstractBashTaskProvider';

function createProjectInfos(projectMode: string, dbPasses?: Record<string, string>): IProjectInfos {
	return {
		projectName: 'project',
		projectMode,
		appSchema: 'ati',
		logicSchema: '',
		dataSchema: '',
		dbAppUser: 'proxy_user',
		dbAppPwd: undefined,
		dbAdminUser: 'admin_user',
		dbAdminPwd: undefined,
		dbTns: '',
		isValid: true,
		isFlexMode: projectMode.toUpperCase() === 'FLEX',
		workspace: undefined,
		dbPasses,
		dbConnMode: 'SQLNET',
		restOauthTokenUrl: undefined,
		restSqlUrl: undefined,
		restAppSchema: undefined,
		restWorkspace: undefined,
	};
}

suite('Connection user resolution', () => {
	test('uses DB_APP_USER without a schema suffix in SINGLE mode when the schema differs', () => {
		const projectInfos = createProjectInfos('SINGLE');

		assert.strictEqual(buildConnectionUser(projectInfos, 'db/ati'), 'proxy_user');
	});

	test('prefers DB_APP_USER over a schema-specific secret in SINGLE mode when the schema differs', () => {
		const projectInfos = createProjectInfos('SINGLE', { dbFlux_ati_PWD: 'schema-password' });

		assert.strictEqual(buildConnectionUser(projectInfos, 'db/ati'), 'proxy_user');
	});

	test('keeps DB_APP_USER unchanged in SINGLE mode when it matches the schema', () => {
		const projectInfos = createProjectInfos('SINGLE');
		projectInfos.dbAppUser = 'ati';

		assert.strictEqual(buildConnectionUser(projectInfos, 'db/ati'), 'ati');
	});

	test('keeps proxy authentication for a different schema in MULTI mode', () => {
		const projectInfos = createProjectInfos('MULTI');

		assert.strictEqual(buildConnectionUser(projectInfos, 'db/ati'), 'proxy_user[ati]');
	});

	test('keeps proxy authentication for a different schema in FLEX mode', () => {
		const projectInfos = createProjectInfos('FLEX');

		assert.strictEqual(buildConnectionUser(projectInfos, 'db/ati'), 'proxy_user[ati]');
	});

	test('keeps the admin user for setup paths in SINGLE mode', () => {
		const projectInfos = createProjectInfos('SINGLE');

		assert.strictEqual(buildConnectionUser(projectInfos, 'db/_setup/users/create_user.sql'), 'admin_user');
	});
});
