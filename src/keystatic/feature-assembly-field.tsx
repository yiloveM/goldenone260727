import {createContext,useContext} from 'react';
export const FeatureUiContext=createContext<{pending:boolean;refresh?:()=>void;features?:Record<string,boolean>}>({pending:false});
export function AssemblyNotice(){const state=useContext(FeatureUiContext);return <aside style={{padding:16,border:'1px solid #73808c66',borderRadius:8,lineHeight:1.7}}><strong>功能总成</strong><p>在这里统一设置网站功能与内容管理工作区。关闭会保留已有内容。保存后，配置入口读取已保存设置；网站展示仍需发布网站更新。</p>{state.pending&&<p>检测到已保存的设置变化。请先保存当前编辑，再更新配置入口。 <button type="button" onClick={state.refresh}>更新配置入口</button></p>}</aside>;}
