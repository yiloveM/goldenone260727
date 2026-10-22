import { githubFetch } from './manager/github';
import { api, type GitContext } from './site-git';

const completedJobs = new Map<string, any[]>();

export const productionDeployStep = (jobs: any[]) => jobs.flatMap(job => job.steps || []).find(step => /^Deploy (?:the production Worker|the Worker) and static assets$/.test(step.name)
  && step.status === 'completed' && step.conclusion === 'success' && step.completed_at);
export const isProductionRelease = (run: any, jobs: any[]) => run.status === 'completed' && run.conclusion === 'success'
  && jobs.some(job => job.status === 'completed' && job.conclusion === 'success' && productionDeployStep([job])
    && job.steps?.some((step: any) => /^Build the Astro site$/.test(step.name) && step.conclusion === 'success'));

// All events matter: qualifying pushes and the existing manual publish button.
// A successful workflow which skipped deployment is never release evidence.
export async function readSiteRelease(ctx: GitContext) {
  if (ctx.repo.toLowerCase() === 'ironstraight/businessweb') return { commit: '', warning: '母版不运行生产发布，草稿保留。' };
  const { workflow_runs: runs = [] } = await githubFetch<{workflow_runs:any[]}>(`${api(ctx)}/actions/workflows/site-publish.yml/runs?branch=${encodeURIComponent(ctx.branch)}&per_page=30`, ctx.token);
  const candidates = runs.filter(run => run.head_branch === ctx.branch && /^(?:push|workflow_dispatch)$/.test(run.event || '') && /^[a-f0-9]{40}$/.test(run.head_sha || ''))
    .sort((a,b)=>String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  const inspected: any[]=[];
  let newestCompletion='';
  for(const run of candidates){
    // A completed run cannot contain a deployment later than its own update.
    // Stop fetching older jobs once a newer verified receipt bounds them.
    if(newestCompletion && run.status==='completed' && run.updated_at && run.updated_at<newestCompletion)continue;
    if(run.status!=='completed'){inspected.push({run,jobs:[],deployed:null});continue;}
    const key=run.updated_at ? `${ctx.repo}:${run.id}:${run.run_attempt || 1}:${run.updated_at}`:'';
    let jobs=key ? completedJobs.get(key):undefined;
    if(!jobs){
      const response=await githubFetch<{jobs:any[];total_count?:number}>(`${api(ctx)}/actions/runs/${run.id}/jobs?per_page=100`,ctx.token);
      jobs=response.jobs || [];
      if((response.total_count || 0)>jobs.length)throw new Error('发布步骤不完整。');
      if(key){completedJobs.set(key,jobs);if(completedJobs.size>128)completedJobs.delete(completedJobs.keys().next().value!);}
    }
    const deployed=productionDeployStep(jobs);
    inspected.push({run,jobs,deployed});
    if(isProductionRelease(run,jobs) && deployed.completed_at>newestCompletion)newestCompletion=deployed.completed_at;
  }
  const releases = inspected.filter(item => isProductionRelease(item.run, item.jobs)).sort((a,b) => String(b.deployed.completed_at).localeCompare(String(a.deployed.completed_at)));
  const latest = releases[0];
  if (!latest) return { commit: '', warning: '尚无可核验的成功生产部署，已审核稿暂保留在待办。' };
  const unsettled = inspected.some(item => item !== latest && (item.deployed && item.deployed.completed_at > latest.deployed.completed_at
    || item.run.status !== 'completed'));
  if (unsettled) return { commit: '', warning: '有尚未确认的后续发布，暂不归档或删除草稿。' };
  return { commit: latest.run.head_sha as string, runId: latest.run.id, completedAt: latest.deployed.completed_at, warning: '' };
}
