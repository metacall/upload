import { promises as fs } from 'fs';
import { prompt } from 'inquirer';
import type { LanguageId } from './protocol/inspect';

const matches: Record<LanguageId, RegExp> = {
	node: /^.*\.jsx?$/i,
	ts: /^.*\.tsx?$/i,
	rb: /^.*\.rb$/i,
	py: /^.*\.py$/i,
	cs: /^.*\.cs$/i,
	cob: /^.*\.cob$/i,
	file: /^.*$/,
	rpc: /^.*$/
};

const ignore = ['node_modules'];

type MetacallJSON = {
	language_id: LanguageId;
	path: string;
	scripts: string[];
};

const findFiles = async (dir = '.'): Promise<string[]> =>
	(
		await Promise.all(
			(
				await fs.readdir(dir)
			)
				.filter(x => !x.startsWith('.') && !ignore.includes(x))
				.map(async file => {
					const path = dir === '.' ? file : `${dir}/${file}`;
					return (await fs.stat(path)).isDirectory()
						? await findFiles(path)
						: [path];
				})
		)
	).flat<string[][]>();

const selectLangs = async () => {
	const def = (await fs.readdir('.'))
		.filter(x => x.startsWith('metacall-') && x.endsWith('.json'))
		.map(x => x.split('metacall-')[1].split('.json')[0] as LanguageId);
	return prompt<{ langs: LanguageId[] }>([
		{
			type: 'checkbox',
			name: 'langs',
			message: 'Select languages to run on Metacall',
			choices: ['node', 'ts', 'rb', 'py', 'cs', 'cob', 'file', 'rpc'],
			default: def
		}
	]);
};

void (async () => {
	const { langs } = await selectLangs();
	const allFiles = await findFiles();
	for (const lang of langs) {
		const fromDisk = JSON.parse(
			await fs.readFile(`metacall-${lang}.json`, 'utf8').catch(() => '{}')
		) as Partial<MetacallJSON>;
		const { scripts } = await prompt<{ scripts: string[] }>([
			{
				type: 'checkbox',
				name: 'scripts',
				message: `Select files to load with ${lang}`,
				choices: [
					...new Set([
						...allFiles.filter(file => matches[lang].test(file)),
						...(fromDisk.scripts ?? [])
					])
				],
				default: fromDisk.scripts ?? []
			}
		]);

		const { enableEnv } = await prompt<{ enableEnv: boolean }>([
			{
				type: 'confirm',
				name: 'enableEnv',
				message: 'Add env vars?',
				default: false
			}
		]);
		const env = enableEnv
			? await prompt<{ env: string }>([
					{
						type: 'input',
						name: 'env',
						message: 'Type env vars in the format: K1=V1, K2=V2'
					}
			  ]).then(({ env }) =>
					Object.fromEntries(
						env.split(',').map(kv => {
							const [k, v] = kv.trim().split('=');
							return [k, v];
						})
					)
			  )
			: {};
		await fs.writeFile(
			`metacall-${lang}.json`,
			JSON.stringify(
				{
					...fromDisk,
					language_id: lang,
					path: fromDisk.path ?? '.',
					scripts: [
						...new Set([
							...(fromDisk.scripts ?? []),
							...(scripts ?? [])
						])
					]
				},
				null,
				2
			)
		);
	}
})();