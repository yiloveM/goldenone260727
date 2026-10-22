declare module 'virtual:site-build-identity' {
  const identity: { commit: string; nativeCommit?:string; files: Record<string, { sha: string; data: Record<string, any> }> };
  export default identity;
}
