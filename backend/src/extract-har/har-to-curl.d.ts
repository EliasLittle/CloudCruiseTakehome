declare module 'har-to-curl' {
  function harToCurl(har: object | string): string | undefined;
  export default harToCurl;
}
