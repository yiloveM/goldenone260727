export const getKeystaticBasePath = () => {
  if (typeof window === 'undefined') return '/keystatic';

  const segments = window.location.pathname.split('/').filter(Boolean);
  if (!segments.length) return '/keystatic';
  if (segments[1] === 'branch' && segments[2]) return `/${segments.slice(0, 3).join('/')}`;
  return `/${segments[0]}`;
};
