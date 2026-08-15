export const keywordTag = (value: string) => {
  const keyword = String(value || '').trim().replace(/^#+\s*/, '');
  return keyword;
};
