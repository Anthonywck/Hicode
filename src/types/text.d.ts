/**
 * 文本文件模块类型声明
 * 允许导入 .txt 文件作为字符串
 */
declare module '*.txt' {
  const content: string;
  export default content;
}
