/**
 * 复制提示文件到 dist 目录
 * 在构建后运行此脚本，确保 .txt 文件被复制到正确的位置
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'session', 'prompt');
const distDir = path.join(__dirname, '..', 'dist', 'session', 'prompt');

// 确保目标目录存在
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 复制所有 .txt 文件
const files = ['plan.txt', 'build-switch.txt', 'max-steps.txt'];

files.forEach(file => {
  const srcFile = path.join(srcDir, file);
  const distFile = path.join(distDir, file);
  
  if (fs.existsSync(srcFile)) {
    fs.copyFileSync(srcFile, distFile);
    console.log(`✓ 已复制 ${file} 到 ${distDir}`);
  } else {
    console.warn(`⚠ 源文件不存在: ${srcFile}`);
  }
});

console.log('提示文件复制完成');
