export const parseBoolean = ({ obj, key }) =>
  ['true', 'false'].includes(obj[key]) ? obj[key] === 'true' : obj[key];
