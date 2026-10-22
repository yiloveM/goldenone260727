import { commitGitFiles, DraftConflict, readGitHead, readGitTree, type GitContext } from '../site-git';
type Selection={sourcePath:string;sourceSha:string};
export async function formalContentDeletionRoute(request:Request,ctx:GitContext,readRecords:(head:string)=>Promise<any[]>,noun:string) {
  const planFor=async(selection:Selection[])=>{
    if(!Array.isArray(selection)||!selection.length||selection.length>10000)throw new Error('Invalid selection');
    const head=await readGitHead(ctx),originals=await readRecords(head),records=originals.flatMap(record=>[record,...(record.translations||[])]),selected=new Map();
    for(const item of selection){const record=records.find(record=>record.sourcePath===item?.sourcePath&&record.sourceSha===item?.sourceSha);if(!record)throw new DraftConflict('内容、公开语言或版本已经变化，请刷新后重新选择。');selected.set(record.sourcePath,record);if(record.locale==='en')for(const translation of record.translations||[])selected.set(translation.sourcePath,translation);}
    return {head,kind:noun,records:[...selected.values()].map(({sourcePath,sourceSha,title,locale,publicUrl})=>({sourcePath,sourceSha,title,locale,publicUrl})).sort((a,b)=>a.sourcePath.localeCompare(b.sourcePath))};
  };
  try {
    const payload=await request.json();
    if(request.method==='POST')return Response.json(await planFor(payload.selection),{headers:{'cache-control':'no-store'}});
    if(payload.confirmed!==true||!/^[a-f0-9]{40}$/.test(payload.head||'')||!Array.isArray(payload.records))throw new Error('Invalid confirmation');
    const plan=await planFor(payload.records),keys=(records:any[])=>records.map(record=>`${record.sourcePath}:${record.sourceSha}`).sort().join('\n');
    if(plan.head!==payload.head||keys(plan.records)!==keys(payload.records))throw new DraftConflict('确认后内容有变化，请重新核对删除计划。');
    const tree=await readGitTree(ctx,plan.head);
    const commit=await commitGitFiles(ctx,plan.head,tree.sha,plan.records.map(record=>({path:record.sourcePath,sha:null})),`Delete ${plan.records.length} selected ${noun} pages [skip ci]`);
    return Response.json({commit,removed:plan.records.length,message:'删除已保存；下次“发布网站更新”完成后，以上页面将撤下。图片和下载文件会保留。'},{headers:{'cache-control':'no-store'}});
  }catch(error){return new Response(error instanceof DraftConflict?error.message:'无法核验或删除内容，请刷新后重试。',{status:error instanceof DraftConflict?409:502,headers:{'cache-control':'no-store'}});}
}
