/**
 * gRPC 接口类型定义
 * 参考 vscode/hicode 项目的实现
 * 这些类型定义与 hicode_agent 项目中的定义保持一致
 */

/**
 * 聊天请求接口
 */
export interface ChatRequest {
  /** 会话ID，用于标识特定的多轮会话 */
  convId: string;
  /** 对话ID，用于标识特定的单次聊天对话 */
  chatId: string;
  /** 用户发送的消息内容 */
  message: string;
  /** Prompt类型 */
  promptType: string;
  /** 语言 */
  language: string;
}

/**
 * 聊天回复接口
 */
export interface ChatReply {
  /** 服务器的回复消息 */
  reply: string;
}

/**
 * 流式聊天回复接口
 */
export interface ChatStreamReply {
  /** 流式回复的数据块 */
  chunk: string;
  /** 是否为最后一个数据块 */
  isEnd: boolean;
}

/**
 * Agent 服务接口定义
 */
export interface AgentService {
  /**
   * 聊天方法
   */
  Chat(request: ChatRequest): Promise<ChatReply>;
  
  /**
   * 流式聊天方法
   */
  ChatStream(request: ChatRequest): Promise<ChatStreamReply>;
}

/**
 * Agent 服务客户端实现类
 */
export class AgentServiceClientImpl implements AgentService {
  private readonly rpc: Rpc;
  private readonly service: string;
  
  constructor(rpc: Rpc, opts?: { service?: string }) {
    this.service = opts?.service || "hicode.agent.AgentService";
    this.rpc = rpc;
  }
  
  Chat(request: ChatRequest): Promise<ChatReply> {
    const data = this.serializeRequest(request);
    const promise = this.rpc.request(this.service, "Chat", data);
    return promise.then((data) => this.deserializeResponse(data) as ChatReply);
  }
  
  ChatStream(request: ChatRequest): Promise<ChatStreamReply> {
    const data = this.serializeRequest(request);
    const promise = this.rpc.request(this.service, "ChatStream", data);
    return promise.then((data) => this.deserializeResponse(data) as ChatStreamReply);
  }
  
  private serializeRequest(request: any): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(request));
  }
  
  private deserializeResponse(data: Uint8Array): any {
    return JSON.parse(new TextDecoder().decode(data));
  }
}

/**
 * RPC 接口定义
 */
interface Rpc {
  request(service: string, method: string, data: Uint8Array): Promise<Uint8Array>;
}
