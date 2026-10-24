import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {managerRoutes,registeredManagerFeature,singletonFeatures,collectionFeatures} from '../src/lib/feature-registry.mjs';
export function auditFeatureContract(root=process.cwd()){
 const routes=[];
 function visit(dir){for(const row of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,row.name);if(row.isDirectory())visit(file);else if(row.name.endsWith('.ts')){const route='/'+path.relative(path.join(root,'src/pages'),file).replaceAll('\\','/').replace(/\.ts$/,''),source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);const methods=[];for(const node of source.statements){if(ts.isVariableStatement(node)&&node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))for(const d of node.declarationList.declarations)if(ts.isIdentifier(d.name)&&/^(GET|POST|PUT|PATCH|DELETE|ALL)$/.test(d.name.text))methods.push(d.name.text);if(ts.isExportDeclaration(node)&&node.exportClause&&ts.isNamedExports(node.exportClause))for(const e of node.exportClause.elements)if(/^(GET|POST|PUT|PATCH|DELETE|ALL)$/.test(e.name.text))methods.push(e.name.text);}
 assert.ok(methods.length,'Missing actual method declaration '+route);assert.ok(Object.hasOwn(managerRoutes,route),'Unregistered route '+route);for(const method of methods)registeredManagerFeature(route,method);routes.push({route,methods});}}}
 visit(path.join(root,'src/pages/api/manager'));assert.deepEqual(routes.map(x=>x.route).sort(),Object.keys(managerRoutes).sort());assert.ok(Object.hasOwn(singletonFeatures,'siteConfig'));for(const key of ['products','blog','productTranslations','blogTranslations'])assert.ok(Object.hasOwn(collectionFeatures,key));return{routes,singletons:Object.keys(singletonFeatures).length,collections:Object.keys(collectionFeatures).length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename))console.log(JSON.stringify(auditFeatureContract()));
