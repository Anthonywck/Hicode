/**
 * 真实的 gRPC 客户端实现
 * 参考 vscode/hicode 项目的实现
 * 用于与 hicode_agent 服务通信
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import * as fs from 'fs';
import { ChatRequest, ChatReply, ChatStreamReply } from './types';

/**
 * gRPC 客户端管理器
 */
export class GrpcClientManager {
  private client: grpc.Client;
  private isConnected: boolean = false;
  private serverUrl: string;
  private packageDefinition: protoLoader.PackageDefinition | null = null;
  private protoClient: any = null;

  constructor(serverUrl: string = 'localhost:50051') {
    this.serverUrl = serverUrl;
    this.client = new grpc.Client(
      this.serverUrl,
      grpc.credentials.createInsecure(),
      {
        'grpc.keepalive_time_ms': 30000,
        'grpc.keepalive_timeout_ms': 5000,
        'grpc.keepalive_permit_without_calls': 1,
        'grpc.http2.max_pings_without_data': 0,
        'grpc.http2.min_time_between_pings_ms': 10000,
        'grpc.http2.min_ping_interval_without_data_ms': 300000
      }
    );
    this.loadProto();
  }

  /**
   * 加载 proto 文件
   */
  private loadProto(): void {
    try {
      const protoPath = path.join(__dirname, '../../proto/agent.proto');
      if (!fs.existsSync(protoPath)) {
        console.warn(`⚠️ Proto file not found at ${protoPath}, using JSON serialization`);
        return;
      }

      this.packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
      });

      const packageDef = grpc.loadPackageDefinition(this.packageDefinition) as any;
      const agentProto = packageDef.hicode?.agent || packageDef.hicode;
      
      if (agentProto && agentProto.AgentService) {
        this.protoClient = new agentProto.AgentService(
          this.serverUrl,
          grpc.credentials.createInsecure()
        );
        console.log('✅ Proto file loaded successfully');
      } else {
        console.warn('⚠️ Failed to load AgentService from proto, using JSON serialization');
      }
    } catch (error) {
      console.warn('⚠️ Failed to load proto file, using JSON serialization:', error);
    }
  }

  /**
   * 连接到 gRPC 服务器
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 5);

      this.client.waitForReady(deadline, (error) => {
        if (error) {
          console.error('❌ 连接 gRPC 服务器失败:', error);
          this.isConnected = false;
          reject(error);
        } else {
          console.log('✅ 成功连接到 gRPC 服务器');
          this.isConnected = true;
          resolve();
        }
      });
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.client) {
      this.client.close();
      this.isConnected = false;
      console.log('🔌 已断开 gRPC 连接');
    }
  }

  /**
   * 检查连接状态
   */
  isClientConnected(): boolean {
    return this.isConnected;
  }

  /**
   * 发送普通聊天请求
   * 使用 agent.AgentService/Chat 服务
   */
  async sendChatRequest(request: ChatRequest): Promise<ChatReply> {
    if (!this.isConnected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const metadata = new grpc.Metadata();
      
      // 如果 proto 客户端可用，使用 proto 序列化
      if (this.protoClient) {
        this.protoClient.Chat(request, metadata, (error: any, response: any) => {
          if (error) {
            console.error('❌ 聊天请求失败:', error);
            reject(error);
          } else {
            console.log('✅ 聊天请求成功');
            resolve({
              reply: response.content || ''
            });
          }
        });
      } else {
        // 回退到 JSON 序列化（不推荐，但作为兼容性方案）
        this.client.makeUnaryRequest(
          '/hicode.agent.AgentService/Chat',
          (arg: ChatRequest) => Buffer.from(JSON.stringify(arg)),
          (buffer: Buffer) => JSON.parse(buffer.toString()) as ChatReply,
          request,
          metadata,
          (error: any, response) => {
            if (error) {
              console.error('❌ 聊天请求失败:', error);
              reject(error);
            } else {
              console.log('✅ 聊天请求成功:', response);
              resolve(response as ChatReply);
            }
          }
        );
      }
    });
  }

  /**
   * 发送流式聊天请求
   * 使用 agent.AgentService/ChatStream 服务
   */
  async sendStreamChatRequest(
    request: ChatRequest,
    onChunk: (chunk: string, isEnd: boolean) => void
  ): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const metadata = new grpc.Metadata();
      
      // 如果 proto 客户端可用，使用 proto 序列化
      if (this.protoClient) {
        const call = this.protoClient.ChatStream(request, metadata);
        
        call.on('data', (response: any) => {
          // 从 StreamChunk 中提取文本内容
          // StreamChunk 可能包含 text 字段（text.content）或直接包含 content
          let chunk = '';
          let isEnd = false;
          
          if (response.text && response.text.content) {
            chunk = response.text.content;
          } else if (response.content) {
            chunk = response.content;
          } else if (typeof response === 'string') {
            chunk = response;
          }
          
          // 检查是否结束
          if (response.finish_reason === 'stop' || response.finish_reason === 'done' || response.isEnd) {
            console.log('✅ 流式聊天请求完成，finish_reason:', response.finish_reason);
            isEnd = true;
          }
          
          if (chunk) {
            onChunk(chunk, isEnd);
          }
        });

        call.on('error', (error: any) => {
          console.error('❌ 流式聊天请求失败:', error);
          // 发送结束信号，用于停止前端流式展示状态
          onChunk('[DONE]', true);
          reject(error);
        });

        call.on('end', () => {
          console.log('✅ 流式聊天请求完成');
          // 发送结束信号，用于停止前端流式展示状态
          onChunk('[DONE]', true);
          resolve();
        });
      } else {
        // 回退到 JSON 序列化（不推荐，但作为兼容性方案）
        const call = this.client.makeServerStreamRequest(
          '/hicode.agent.AgentService/ChatStream',
          (arg: ChatRequest) => Buffer.from(JSON.stringify(arg)),
          (buffer: Buffer) => JSON.parse(buffer.toString()) as ChatStreamReply,
          request,
          metadata
        );

        call.on('data', (response: ChatStreamReply) => {
          console.log('📥 收到流式数据:', response);
          onChunk(response.chunk, response.isEnd);
        });

        call.on('error', (error) => {
          console.error('❌ 流式聊天请求失败:', error);
          reject(error);
        });

        call.on('end', () => {
          console.log('✅ 流式聊天请求完成');
          resolve();
        });
      }
    });
  }
}

/**
 * 全局 gRPC 客户端实例
 */
let grpcClientManager: GrpcClientManager | null = null;

/**
 * 获取 gRPC 客户端管理器实例
 */
export function getGrpcClientManager(serverUrl?: string): GrpcClientManager {
  if (!grpcClientManager) {
    grpcClientManager = new GrpcClientManager(serverUrl);
  }
  return grpcClientManager;
}

/**
 * 初始化 gRPC 客户端
 */
export async function initializeGrpcClient(serverUrl?: string): Promise<void> {
  const client = getGrpcClientManager(serverUrl);
  await client.connect();
}

/**
 * 关闭 gRPC 客户端
 */
export function closeGrpcClient(): void {
  if (grpcClientManager) {
    grpcClientManager.disconnect();
    grpcClientManager = null;
  }
}
