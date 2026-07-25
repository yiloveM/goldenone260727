import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outputDir = path.join(root, 'src', 'data', 'articleBodyTranslations');
const supportedLocales = ['zh', 'ar', 'hi', 'es', 'pt', 'fr', 'ru', 'ko', 'fil', 'tr', 'de', 'uz', 'bn', 'ur'];
const languageSettings = JSON.parse(await readFile(path.join(root, 'src', 'data', 'site-language-settings.json'), 'utf8'));
const locales = supportedLocales.filter(locale => languageSettings.enabledLocales?.[locale] === true);

await mkdir(outputDir, { recursive: true });

for (const locale of locales) {
  const exportName = `${locale}ArticleBodyTranslations`;
  const filePath = path.join(outputDir, `${locale}.ts`);
  await writeFile(filePath, `export const ${exportName} = {};\n`, 'utf8');
}

console.log('Static article body translation maps were reset to empty template maps.');
