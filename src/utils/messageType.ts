/**
 * 消息类型定义
 * 
 * 定义前端（Webview）和后端（Extension）之间的消息类型常量
 * 命名规范：
 * - F2B: Frontend to Backend (前端到后端)
 * - B2F: Backend to Frontend (后端到前端)
 * - REQ: Request (请求)
 * - RES: Response (响应)
 * 
 * @module messageType
 */

// ========== 聊天相关消息 ==========

/** 前端请求：发送聊天消息 */
export const HICODE_ASK_QUESTION_F2B_REQ = 'hicode_ask_question_f2b_req';

/** 后端响应：聊天消息响应 */
export const HICODE_ASK_QUESTION_B2F_RES = 'hicode_ask_question_b2f_res';

/** 前端请求：新建对话 */
export const HICODE_NEW_CHAT_F2B_REQ = 'hicode_new_chat_f2b_req';

/** 后端通知：新会话（系统消息） */
export const HICODE_NEW_CONVERSATION = 'hicode_new_conversation';

// ========== 模型配置相关消息 ==========

/** 前端请求：获取模型列表 */
export const HICODE_GET_MODELS_F2B_REQ = 'hicode_get_models_f2b_req';

/** 后端响应：获取模型列表响应 */
export const HICODE_GET_MODELS_B2F_RES = 'hicode_get_models_b2f_res';

/** 前端请求：切换当前模型 */
export const HICODE_CHANGE_MODEL_F2B_REQ = 'hicode_change_model_f2b_req';

/** 后端响应：切换模型响应 */
export const HICODE_CHANGE_MODEL_B2F_RES = 'hicode_change_model_b2f_res';

/** 前端请求：切换聊天模式 */
export const HICODE_CHANGE_MODE_F2B_REQ = 'hicode_change_mode_f2b_req';

/** 后端响应：切换聊天模式响应 */
export const HICODE_CHANGE_MODE_B2F_RES = 'hicode_change_mode_b2f_res';

/** 前端请求：切换 Agent 模式 */
export const HICODE_CHANGE_AGENT_MODE_F2B_REQ = 'hicode_change_agent_mode_f2b_req';

/** 后端响应：切换 Agent 模式响应 */
export const HICODE_CHANGE_AGENT_MODE_B2F_RES = 'hicode_change_agent_mode_b2f_res';

/** 前端请求：新增模型配置 */
export const HICODE_ADD_MODEL_F2B_REQ = 'hicode_add_model_f2b_req';

/** 前端请求：编辑模型配置 */
export const HICODE_EDIT_MODEL_F2B_REQ = 'hicode_edit_model_f2b_req';

/** 前端请求：删除模型配置 */
export const HICODE_DELETE_MODEL_F2B_REQ = 'hicode_delete_model_f2b_req';

/** 后端响应：刷新模型列表（新增/编辑/删除后） */
export const HICODE_REFRESH_MODELS_B2F_RES = 'hicode_refresh_models_b2f_res';

/** 前端请求：获取 Provider 列表 */
export const HICODE_GET_PROVIDERS_F2B_REQ = 'hicode_get_providers_f2b_req';

/** 后端响应：获取 Provider 列表响应 */
export const HICODE_GET_PROVIDERS_B2F_RES = 'hicode_get_providers_b2f_res';

/** 前端请求：获取指定 Provider 的模型列表 */
export const HICODE_GET_PROVIDER_MODELS_F2B_REQ = 'hicode_get_provider_models_f2b_req';

/** 后端响应：获取 Provider 模型列表响应 */
export const HICODE_GET_PROVIDER_MODELS_B2F_RES = 'hicode_get_provider_models_b2f_res';

// ========== 设置相关消息 ==========

/** 前端请求：获取设置 */
export const HICODE_GET_SETTINGS_F2B_REQ = 'hicode_get_settings_f2b_req';

/** 后端响应：获取设置响应 */
export const HICODE_GET_SETTINGS_B2F_RES = 'hicode_get_settings_b2f_res';

// ========== 用户提示词相关消息 ==========

/** 前端请求：新增用户提示词 */
export const HICODE_ADD_USER_PROMPT_F2B_REQ = 'hicode_add_user_prompt_f2b_req';

/** 前端请求：编辑用户提示词 */
export const HICODE_EDIT_USER_PROMPT_F2B_REQ = 'hicode_edit_user_prompt_f2b_req';

/** 前端请求：删除用户提示词 */
export const HICODE_DELETE_USER_PROMPT_F2B_REQ = 'hicode_delete_user_prompt_f2b_req';

/** 后端响应：刷新用户提示词列表 */
export const HICODE_REFRESH_USER_PROMPTS_B2F_RES = 'hicode_refresh_user_prompts_b2f_res';

// ========== 产品级规范相关消息 ==========

/** 前端请求：新增产品级规范 */
export const HICODE_ADD_SPECIFICATION_F2B_REQ = 'hicode_add_specification_f2b_req';

/** 前端请求：编辑产品级规范 */
export const HICODE_EDIT_SPECIFICATION_F2B_REQ = 'hicode_edit_specification_f2b_req';

/** 前端请求：删除产品级规范 */
export const HICODE_DELETE_SPECIFICATION_F2B_REQ = 'hicode_delete_specification_f2b_req';

/** 后端响应：刷新产品级规范列表 */
export const HICODE_REFRESH_SPECIFICATIONS_B2F_RES = 'hicode_refresh_specifications_b2f_res';

// ========== 历史记录相关消息 ==========

/** 前端请求：打开历史记录 */
export const HICODE_OPEN_HISTORY_F2B_REQ = 'hicode_open_history_f2b_req';

/** 前端请求：获取历史记录列表 */
export const HICODE_GET_HISTORY_F2B_REQ = 'hicode_get_history_f2b_req';

/** 后端响应：历史记录列表响应 */
export const HICODE_GET_HISTORY_B2F_RES = 'hicode_get_history_b2f_res';

// ========== 系统消息 ==========

/** 前端通知：Webview 准备就绪 */
export const HICODE_WEBVIEW_READY = 'hicode_webview_ready';

/** 前端通知：控制台日志 */
export const HICODE_CONSOLE_LOG = 'hicode_console_log';

/** 后端通知：错误消息 */
export const HICODE_ERROR_B2F = 'hicode_error_b2f';

// ========== 代码选择相关消息 ==========

/** 后端通知：代码选择变化（插件端到前端） */
export const HICODE_SELECTION_CHANGE = 'hicode_selection_change';

/** 前端请求：清除代码选择（前端到插件端） */
export const HICODE_CLEAR_SELECTION = 'hicode_clear_selection';

/** 后端通知：添加选中代码到资源列表（插件端到前端） */
export const HICODE_ADD_SELECTION_TO_RESOURCES_B2F = 'hicode_add_selection_to_resources_b2f';

// ========== 代码操作相关消息 ==========

/** 前端请求：插入代码到编辑器（前端到插件端） */
export const HICODE_INSERT_CODE_F2B_REQ = 'hicode_insert_code_f2b_req';

// ========== 工具调用相关消息 ==========

/** 后端通知：工具调用状态更新（插件端到前端） */
export const HICODE_TOOL_CALL_UPDATE_B2F = 'hicode_tool_call_update_b2f';

// ========== 权限相关消息 ==========

/** 后端通知：权限请求（插件端到前端） */
export const HICODE_PERMISSION_REQUEST_B2F = 'hicode_permission_request_b2f';

/** 前端请求：权限响应（前端到插件端） */
export const HICODE_PERMISSION_RESPONSE_F2B_REQ = 'hicode_permission_response_f2b_req';