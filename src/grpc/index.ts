/**
 * gRPC模块导出
 * 参考 vscode/hicode 项目的实现
 */

// 类型定义
export type { ChatRequest, ChatReply, ChatStreamReply, AgentService } from './types';
export { AgentServiceClientImpl } from './types';

// gRPC 客户端管理器
export { GrpcClientManager, getGrpcClientManager, initializeGrpcClient, closeGrpcClient } from './grpcClient';

// 聊天接口封装
export { fetchStreamResponse, fetchResponse } from './chat';
