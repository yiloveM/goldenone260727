import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

const cwd = process.cwd();
const payloadBase64 = process.env.MANAGER_BLOG_DRAFT_PAYLOAD || '';
const draftId = process.env.MANAGER_BLOG_DRAFT_ID || '';
const inputSlug = process.env.MANAGER_BLOG_SLUG || '';

const fail = message => {
  console.error(message);
  process.exit(1);
};

if (!payloadBase64) fail('MANAGER_BLOG_DRAFT_PAYLOAD is required.');
if (!draftId) fail('MANAGER_BLOG_DRAFT_ID is required.');

let payload;
try {
  payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
} catch (error) {
  fail(`Cannot decode manager blog draft payload: ${error instanceof Error ? error.message : String(error)}`);
}

const blogSlug = String(payload.blogSlug || inputSlug || '').trim();
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(blogSlug)) {
  fail(`Invalid blog slug: ${blogSlug}`);
}

const requiredTextFields = ['title', 'description', 'category', 'body'];
for (const field of requiredTextFields) {
  if (!String(payload[field] || '').trim()) {
    fail(`Blog draft is missing ${field}.`);
  }
}

const blogPath = path.join(cwd, 'src', 'content', 'blog', `${blogSlug}.mdoc`);
let source;
try {
  source = await fs.readFile(blogPath, 'utf8');
} catch {
  source = `---
title: ""
description: ""
publishDate: ${new Date().toISOString()}
category: ""
image: ""
author: Golden One Editorial Team
featured: false
---
`;
}

const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (!match) {
  fail(`Blog file is missing frontmatter: ${blogPath}`);
}

const frontmatter = match[1];
const document = YAML.parseDocument(frontmatter);

document.set('title', String(payload.title).trim());
document.set('description', String(payload.description).trim());
document.set('category', String(payload.category).trim());
document.set('image', String(payload.image || '').trim());
document.set('author', String(payload.author || 'Golden One Editorial Team').trim());
document.set('publishDate', String(payload.publishDate || new Date().toISOString()).trim());
document.set('featured', payload.featured === true);

const body = `\n${String(payload.body || '').trim()}\n`;
const nextFrontmatter = document.toString({ lineWidth: 0 }).trimEnd();
const nextSource = `---\n${nextFrontmatter}\n---${body}`;

if (nextSource === source) {
  console.log(`No changes for ${blogSlug}.`);
} else {
  await fs.writeFile(blogPath, nextSource, 'utf8');
  console.log(`Applied manager blog draft ${draftId} to ${blogPath}.`);
}
