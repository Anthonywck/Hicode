/**
 * gRPC 聊天接口封装
 * 参考 vscode/hicode 项目的实现
 * 提供简单的 fetchStreamResponse 和 fetchResponse 函数
 */

import { ChatRequest } from './types';
import { getGrpcClientManager } from './grpcClient';
import * as vscode from 'vscode';
import { generateUUID } from '../utils/tools';

// 流式输出的结束标识符
const HICODE_DONE_FLAG = '[DONE]';

/**
 * 获取当前打开编辑器的语言
 */
async function getLanguageByOpenEditor(): Promise<string> {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    return editor.document.languageId || 'plaintext';
  }
  return 'plaintext';
}

/**
 * 使用 gRPC 流式接口获取流式响应
 * @param params - 符合 proto 定义的 ChatRequest 对象（包含 messages, model, stream, model_config 等）
 * @param onData - 数据回调函数，用于接收流式数据
 */
export async function fetchStreamResponse(params: any, onData: (text: string) => void) {
  try {
    // 从配置获取服务器地址
    const config = vscode.workspace.getConfiguration('hicode');
    const serverUrl = config.get<string>('agentServiceUrl', 'localhost:50051');
    
    const client = getGrpcClientManager(serverUrl);
    
    console.log(`📤 发送 gRPC 流式聊天请求 - 模型: ${params.model}, 消息数: ${params.messages?.length || 0}`);
    
    // 使用真实的 gRPC 客户端发送流式请求
    // params 已经是符合 proto 定义的格式
    await client.sendStreamChatRequest(params, (chunk: string, isEnd: boolean) => {
      console.log(`📥 收到 gRPC 流式聊天回复 - 回复: ${chunk}`);
      console.log(`📥 收到 gRPC 流式聊天回复 - 是否结束: ${isEnd}`);
      if (isEnd) {
        onData(HICODE_DONE_FLAG);
      } else {
        onData(chunk);
      }
    });
    
    console.log(`📥 gRPC 流式聊天请求完成`);
  } catch (error) {
    console.error('❌ gRPC 流式聊天请求失败:', error);
    throw error;
  }
}

/**
 * 使用 gRPC 普通接口获取响应
 * @param params - 符合 proto 定义的 ChatRequest 对象（包含 messages, model, stream, model_config 等）
 * @returns 完整的回复内容
 */
export async function fetchResponse(params: any): Promise<string> {
  try {
    // 从配置获取服务器地址
    const config = vscode.workspace.getConfiguration('hicode');
    const serverUrl = config.get<string>('agentServiceUrl', 'localhost:50051');
    
    const client = getGrpcClientManager(serverUrl);
    
    console.log(`📤 发送 gRPC 聊天请求 - 模型: ${params.model}, 消息数: ${params.messages?.length || 0}`);
    
    // params 已经是符合 proto 定义的格式
    const response = await client.sendChatRequest(params);
    
    console.log(`📥 收到 gRPC 聊天回复 - 回复: ${response.reply}`);
    
    return response.reply;
  } catch (error) {
    console.error('❌ gRPC 聊天请求失败:', error);
    throw error;
  }
}
