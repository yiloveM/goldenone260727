const escapes = {
  '<': '\\u003C',
  '>': '\\u003E',
  '&': '\\u0026',
  "'": '\\u0027',
};

export const serializeJsonLd = value => {
  const json = JSON.stringify(value);
  if (typeof json !== 'string') throw new TypeError('JSON-LD must be a serializable value.');
  return json
    .replace(/[<>&']/g, character => escapes[character])
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
};
