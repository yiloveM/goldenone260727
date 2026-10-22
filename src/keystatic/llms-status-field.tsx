import { useEffect, useRef, useState } from 'react';
import { useSyncedSurfaceTheme } from './use-synced-surface-theme';
type Status={enabled:boolean;matchesCurrent:boolean;locales:Array<{locale:string;entries:number;markdown:number;path:string;fullTruncated:boolean}>;limits:Array<{locale:string;reason:string}>;skipped:Record<string,number>;logsUrl?:string};
export function LlmsStatusInput(){
  const root=useRef<HTMLDivElement|null>(null);useSyncedSurfaceTheme(root,'sp');
  const [status,setStatus]=useState<Status|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const refresh=async()=>{
    setBusy(true);setMessage('正在读取已发布状态…');
    try{const response=await fetch('/api/keystatic/llms-status',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error();setStatus(await response.json());setMessage('');}
    catch{setMessage('暂时无法读取生成状态。首次启用请保存并发布网站更新后再检查。');}finally{setBusy(false);}
  };
  useEffect(()=>{void refresh();},[]);
  return <div ref={root} style={{color:'var(--sp-text)',background:'var(--sp-panel)',border:'1px solid var(--sp-border)',borderRadius:10,padding:16,overflowWrap:'anywhere'}}>
    <h3 style={{marginTop:0}}>AI 内容导航 · 已发布状态</h3>
    <p>保存设置后，使用“发布网站更新”。这里显示最近一次已发布版本；未保存的编辑不参与比较。</p>
    <button type="button" disabled={busy} onClick={()=>void refresh()} style={{color:'inherit',background:'var(--sp-muted-bg)',border:'1px solid var(--sp-border)',borderRadius:6,padding:'8px 12px',cursor:'pointer'}}>刷新生成状态</button>
    <div role="status" aria-live="polite">{message}{status&&<>
      <p>{status.enabled?'已启用':'已关闭'} · {status.matchesCurrent?'与已保存设置一致':'已保存设置尚未发布，请发布网站更新'}</p>
      <ul>{status.locales.map(item=><li key={item.locale}>{item.locale}：{item.entries} 个条目，{item.markdown} 份 Markdown{item.fullTruncated?'；合并全文已达大小上限':''}</li>)}</ul>
      {Object.keys(status.skipped).length>0&&<p>部分页面因公开状态、语言、收录范围或条目上限被跳过。具体数量可在本次构建日志的 llms.txt 摘要中查看。</p>}
      {status.logsUrl&&<a href={status.logsUrl} target="_blank" rel="noreferrer">查看现有发布记录和构建日志</a>}
    </>}</div>
  </div>;
}
export const llmsStatusField=()=>({kind:'form' as const,label:'生成状态',Input:LlmsStatusInput,defaultValue:()=>'',parse:()=>'',serialize:()=>({value:undefined}),validate:(value:string)=>value,reader:{parse:()=>''}});
