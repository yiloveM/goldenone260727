let queue = Promise.resolve();
const css = `.bw-dialog{--d-bg:#fff;--d-text:#172033;--d-muted:#667085;--d-line:#d0d5dd;--d-soft:#f8fafc;box-sizing:border-box;width:min(680px,calc(100vw - 32px));max-height:85dvh;padding:0;border:1px solid var(--d-line);border-radius:14px;color:var(--d-text);background:var(--d-bg);box-shadow:0 24px 80px #0005;font:14px/1.6 system-ui,sans-serif;overflow:hidden}.bw-dialog[data-theme=dark]{--d-bg:#20242c;--d-text:#f2f4f7;--d-muted:#b6c0cf;--d-line:#48505e;--d-soft:#292f39;color-scheme:dark}.bw-dialog::backdrop{background:rgb(9 16 28 / .62);backdrop-filter:blur(3px)}.bw-dialog form{display:flex;flex-direction:column;max-height:85dvh;margin:0}.bw-dialog header{padding:22px 24px 16px;border-bottom:1px solid var(--d-line)}.bw-dialog h2{font-size:20px;line-height:1.4;margin:0;color:var(--d-text)}.bw-dialog__body{padding:18px 24px;overflow:auto;min-height:0;overscroll-behavior:contain}.bw-dialog p{margin:0 0 12px;white-space:pre-line;overflow-wrap:anywhere}.bw-dialog ul{list-style:none;padding:0;margin:0;border:1px solid var(--d-line);border-radius:8px;overflow:hidden}.bw-dialog li{padding:12px 14px;background:var(--d-soft);border-bottom:1px solid var(--d-line);overflow-wrap:anywhere}.bw-dialog li:last-child{border-bottom:0}.bw-dialog small{display:block;color:var(--d-muted);font-size:12px}.bw-dialog input{box-sizing:border-box;width:100%;padding:10px 12px;background:var(--d-soft);color:var(--d-text);border:1px solid var(--d-line);border-radius:6px;font:inherit}.bw-dialog footer{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;padding:16px 24px;border-top:1px solid var(--d-line)}.bw-dialog button{font:inherit;font-weight:600;cursor:pointer;padding:9px 18px;min-height:42px;border-radius:7px;border:1px solid var(--d-line);background:var(--d-bg);color:var(--d-text)}.bw-dialog button[data-primary]{background:#176c82;border-color:#176c82;color:#fff}.bw-dialog button[data-danger]{background:#b42318;border-color:#b42318;color:#fff}.bw-dialog[data-theme=dark] button[data-danger]{background:#b83227}.bw-dialog button:focus-visible,.bw-dialog input:focus-visible{outline:3px solid #53b1fd;outline-offset:3px}@media(max-width:520px){.bw-dialog header,.bw-dialog__body,.bw-dialog footer{padding:16px}.bw-dialog footer button{flex:1}}`;
function openDialog(options) {
  return new Promise(resolve => {
    if(!document.getElementById('bw-dialog-style')) { const style=document.createElement('style');style.id='bw-dialog-style';style.textContent=css;document.head.append(style); }
    const previous=options.returnFocus || document.activeElement;
    const dialog=document.createElement('dialog');dialog.className='bw-dialog';
    const syncTheme=()=>{
      const declared=document.documentElement.dataset.theme;
      if(declared==='dark'||declared==='light'){dialog.dataset.theme=declared;return;}
      let node=previous instanceof HTMLElement ? previous.parentElement : document.body, background='';
      while(node) {const color=getComputedStyle(node).backgroundColor;if(color && !/rgba\(0, 0, 0, 0\)|transparent/.test(color)){background=color;break;}node=node.parentElement;}
      const rgb=background.match(/[\d.]+/g)?.slice(0,3).map(Number);
      const dark=rgb ? rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722<135 : matchMedia('(prefers-color-scheme: dark)').matches;
      dialog.dataset.theme=dark?'dark':'light';
    };
    syncTheme();
    const observer=new MutationObserver(syncTheme);observer.observe(document.documentElement,{attributes:true,attributeFilter:['class','style','data-theme','data-color-scheme']});observer.observe(document.body,{attributes:true,attributeFilter:['class','style','data-theme','data-color-scheme']});
    const form=document.createElement('form');form.method='dialog';
    const header=document.createElement('header'),title=document.createElement('h2');title.id='bw-dialog-title';title.textContent=options.title || '确认操作';header.append(title);dialog.setAttribute('aria-labelledby',title.id);
    const body=document.createElement('div');body.className='bw-dialog__body';
    if(options.message) { const p=document.createElement('p');p.id='bw-dialog-description';p.textContent=options.message;body.append(p);dialog.setAttribute('aria-describedby',p.id); }
    if(options.items?.length) {const list=document.createElement('ul');for(const item of options.items){const li=document.createElement('li'),strong=document.createElement('strong');strong.textContent=typeof item==='string'?item:item.title;li.append(strong);if(item.detail){const small=document.createElement('small');small.textContent=item.detail;li.append(small);}list.append(li);}body.append(list);}
    let input;
    if(options.input) {const label=document.createElement('label');label.textContent=options.input.label || '内容';input=document.createElement('input');input.value=options.input.value || '';input.readOnly=Boolean(options.input.readOnly);input.setAttribute('aria-label',options.input.label || '内容');label.append(input);body.append(label);}
    const footer=document.createElement('footer'),cancel=document.createElement('button'),confirm=document.createElement('button');cancel.type='button';cancel.textContent='取消';confirm.type='submit';confirm.textContent=options.confirmLabel || '确认';confirm.dataset[options.danger?'danger':'primary']='';footer.append(cancel,confirm);form.append(header,body,footer);dialog.append(form);document.body.append(dialog);
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;observer.disconnect();dialog.close();dialog.remove();requestAnimationFrame(()=>{if(previous?.isConnected&&!previous.disabled)previous.focus();else if(previous?.id)document.getElementById(previous.id)?.focus();});resolve(value);};
    cancel.addEventListener('click',()=>finish(null));dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
    form.addEventListener('submit',event=>{event.preventDefault();finish(input?input.value:true);});
    dialog.showModal();(input || cancel).focus();if(input)input.select();
  });
}
export function adminDialog(options) {
  const result=queue.then(()=>openDialog(options));queue=result.catch(()=>{});return result;
}
export const confirmDialog = (message, options={}) => adminDialog({message,...options});
export const promptDialog = (label,value='',options={}) => adminDialog({title:label,input:{label,value,readOnly:options.readOnly},confirmLabel:options.readOnly?'完成':'确定',...options});
export const confirmDeletionPlan = (plan,options={}) => adminDialog({title:`删除 ${plan.records.length} 个${plan.kind === 'product' ? '产品' : '文章'}页面`,danger:true,confirmLabel:'确认删除这些页面',message:'删除将在下一次“发布网站更新”完成后生效。选择英文原文时，清单也包含其已公开的译文。图片及下载文件会保留。',items:plan.records.map(record=>({title:`${record.locale} · ${record.title}`,detail:record.publicUrl})),...options});
