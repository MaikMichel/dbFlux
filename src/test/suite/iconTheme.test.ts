import * as assert from 'assert';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { toFlatPropertyMap } from '../../helper/utilities';
import { dbFolderDef, restFolderDef } from '../../wizards/InitializeProjectWizard';

// generic folder names that intentionally keep the default folder icon,
// because the icon theme matches by name in every workspace
const GENERIC_FOLDER_NAMES = ['init', 'patch', 'pre', 'post', 'base'];

const extensionRoot = path.resolve(__dirname, '..', '..', '..');
const themeFile = path.join(extensionRoot, 'icons', 'dbflux-icon-theme.json');

function folderNamesOf(def: object): string[] {
	const names = new Set<string>();
	Object.keys(toFlatPropertyMap(def)).forEach(p => p.split('/').forEach(n => names.add(n)));
	return [...names];
}

suite('dbFlux Icon Theme', () => {
	const theme = JSON.parse(readFileSync(themeFile, 'utf8'));

	test('is contributed in package.json', () => {
		const pkg = JSON.parse(readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
		const contributed = pkg.contributes.iconThemes.find((t: any) => t.id === 'dbflux-icons');
		assert.ok(contributed, 'iconThemes entry dbflux-icons missing');
		assert.ok(existsSync(path.join(extensionRoot, contributed.path)), 'theme file missing');
	});

	test('every icon definition points to an existing svg', () => {
		for (const [id, def] of Object.entries<any>(theme.iconDefinitions)) {
			const file = path.join(path.dirname(themeFile), def.iconPath);
			assert.ok(existsSync(file), `${id}: ${def.iconPath} does not exist`);
		}
	});

	test('every mapping references a defined icon', () => {
		const refs: string[] = [theme.file, theme.folder, theme.folderExpanded, theme.rootFolder, theme.rootFolderExpanded];
		['folderNames', 'folderNamesExpanded', 'fileExtensions', 'fileNames'].forEach(k => refs.push(...Object.values<string>(theme[k])));
		refs.forEach(r => assert.ok(theme.iconDefinitions[r], `icon definition ${r} missing`));
	});

	test('all dbFlow folders have an icon (closed and expanded)', () => {
		const expected = [
			'db', 'apex', 'static', 'rest', 'reports', 'plugin', '_setup',
			...folderNamesOf(dbFolderDef[0]),
			...folderNamesOf(restFolderDef[0]),
		].filter(n => !GENERIC_FOLDER_NAMES.includes(n));

		for (const name of expected) {
			assert.ok(theme.folderNames[name], `folderNames.${name} missing`);
			assert.ok(theme.folderNamesExpanded[name], `folderNamesExpanded.${name} missing`);
		}
	});

	test('database source files have an icon', () => {
		['sql', 'pks', 'pkb', 'tps', 'tpb', 'js', 'css'].forEach(ext =>
			assert.ok(theme.fileExtensions[ext], `fileExtensions.${ext} missing`));
		['build.env', 'apply.env'].forEach(n =>
			assert.ok(theme.fileNames[n], `fileNames.${n} missing`));
	});
});
