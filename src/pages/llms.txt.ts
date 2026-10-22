import type { APIRoute } from 'astro';
import { llmsSourceManifest } from '../lib/llms-source';

export const prerender = true;

// Build-only seed; the mandatory llms-discovery integration replaces/removes it
// before a successful artifact exists. Never publish this JSON as llms.txt.
export const GET: APIRoute = async () => Response.json(await llmsSourceManifest());
