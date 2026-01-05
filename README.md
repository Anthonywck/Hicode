# HiCode AI Model Integration

VSCode extension for integrating multiple AI models (DeepSeek, ChatGPT, ZhipuAI) with intelligent code assistance features.

## Features

- **Chat Interface**: Conversational AI assistance in VSCode sidebar
- **Code Completion**: AI-powered intelligent code suggestions
- **Inline Chat**: Interact with AI directly in the editor
- **Agent System**: Automated programming tasks (refactoring, testing, documentation)
- **Multi-Model Support**: Switch between DeepSeek, OpenAI, and ZhipuAI models
- **Context-Aware**: Understands your project structure and code context

## Quick Start

### Installation

1. Install the extension from VSCode marketplace
2. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Run `HiCode: Configure AI Models`
4. Add at least one AI model configuration with API key

### First Use

**Open Chat**: `Ctrl+Shift+H` / `Cmd+Shift+H`  
**Inline Chat**: Select code, then `Ctrl+Shift+I` / `Cmd+Shift+I`  
**Code Completion**: Start typing, suggestions appear automatically

## Documentation

- **[User Guide](docs/user-guide.md)** - Complete feature documentation and usage instructions
- **[Configuration Guide](docs/configuration-guide.md)** - Detailed configuration options and examples
- **[Troubleshooting](docs/troubleshooting.md)** - Common issues and solutions
- **[Shortcuts Reference](docs/shortcuts-reference.md)** - Quick reference for all keyboard shortcuts
- **[Testing Guide](docs/testing-guide.md)** - Testing framework and guidelines

## Key Features

### 1. Chat Interface

Conversational AI assistance with:
- Streaming responses
- Markdown support with code highlighting
- Conversation history
- Automatic code context inclusion

### 2. Code Completion

AI-driven code suggestions with:
- Context-aware completions
- Multi-line suggestions
- Sub-500ms response time
- Support for all major programming languages

### 3. Inline Chat

Editor-integrated AI interaction with:
- Diff preview for code suggestions
- Quick commands (`/refactor`, `/test`, `/explain`, etc.)
- Intent recognition and smart routing
- Multi-turn conversations

### 4. Agent System

Automated programming tasks:
- **Refactor**: Improve code structure and readability
- **Test**: Generate unit tests
- **Document**: Create documentation comments
- **Fix**: Identify and fix issues
- **Optimize**: Improve performance

## Keyboard Shortcuts

### Global

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| Open Chat | `Ctrl+Shift+H` | `Cmd+Shift+H` |
| Inline Chat | `Ctrl+Shift+I` | `Cmd+Shift+I` |
| New Conversation | `Ctrl+Shift+N` | `Cmd+Shift+N` |
| Trigger Completion | `Ctrl+Space` | `Cmd+Space` |

### Agent (with code selected)

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| Refactor | `Ctrl+Shift+R` | `Cmd+Shift+R` |
| Generate Tests | `Ctrl+Shift+T` | `Cmd+Shift+T` |
| Explain Code | `Ctrl+Shift+E` | `Cmd+Shift+E` |
| Generate Docs | `Ctrl+Shift+D` | `Cmd+Shift+D` |

See [Shortcuts Reference](docs/shortcuts-reference.md) for complete list.

## Configuration

### Model Configuration Example

```json
{
  "hicode.modelConfigs": [
    {
      "modelId": "deepseek-chat",
      "modelName": "deepseek-chat",
      "displayName": "DeepSeek Chat",
      "vendor": "deepseek",
      "apiBaseUrl": "https://api.deepseek.com/v1",
      "maxContextTokens": 32000,
      "supportMultimodal": false
    }
  ],
  "hicode.currentModel": "deepseek-chat"
}
```

See [Configuration Guide](docs/configuration-guide.md) for detailed configuration options.

## Setup

### Install Dependencies

```bash
npm install
```

### Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Build

```bash
# Build TypeScript
npm run build

# Watch mode for development
npm run watch
```

## Testing Framework

This project uses:
- **Jest**: Testing framework with TypeScript support via ts-jest
- **fast-check**: Property-based testing library for comprehensive test coverage
- **axios**: HTTP client for API requests
- **eventsource**: Server-Sent Events client for streaming responses

See [Testing Guide](docs/testing-guide.md) for testing best practices.

## Project Structure

```
.
├── src/                    # Source code
│   ├── api/               # API client and adapters
│   │   ├── adapters/      # Model-specific adapters
│   │   ├── client.ts      # API client manager
│   │   └── types.ts       # Type definitions
│   ├── agent/             # Agent system
│   │   ├── executor.ts    # Task executor
│   │   ├── system.ts      # Agent system core
│   │   └── tasks.ts       # Task definitions
│   ├── config/            # Configuration management
│   │   ├── manager.ts     # Config manager
│   │   └── validator.ts   # Config validator
│   ├── context/           # Context management
│   │   ├── analyzer.ts    # Code analyzer
│   │   ├── cache.ts       # Context cache
│   │   └── manager.ts     # Context manager
│   ├── history/           # Conversation history
│   │   └── manager.ts     # History manager
│   ├── intent/            # Intent routing
│   │   └── router.ts      # Intent router
│   ├── message/           # Message handling
│   │   ├── commandSuggestions.ts
│   │   ├── markdownRenderer.ts
│   │   ├── messageActions.ts
│   │   ├── messageHandler.ts
│   │   └── responsiveLayout.ts
│   ├── providers/         # VSCode providers
│   │   ├── completionProvider.ts
│   │   └── inline.ts      # Inline chat provider
│   ├── security/          # Security features
│   │   ├── authorization.ts
│   │   ├── localMode.ts
│   │   └── logFilter.ts
│   ├── utils/             # Utilities
│   │   ├── error.ts       # Error handling
│   │   ├── keybindings.ts # Keybinding utilities
│   │   ├── logger.ts      # Logging
│   │   └── performance.ts # Performance optimization
│   └── index.ts           # Extension entry point
├── docs/                  # Documentation
│   ├── user-guide.md
│   ├── configuration-guide.md
│   ├── troubleshooting.md
│   ├── shortcuts-reference.md
│   └── testing-guide.md
├── dist/                  # Compiled output
├── jest.config.js         # Jest configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # Project dependencies
```

## Requirements

- Node.js >= 18.x
- VSCode >= 1.85.0

## Supported Models

- **DeepSeek**: DeepSeek Chat, DeepSeek Coder
- **OpenAI**: GPT-4, GPT-4 Turbo, GPT-3.5 Turbo
- **ZhipuAI**: GLM-4, GLM-3 Turbo
- **Custom**: Self-hosted models with OpenAI-compatible API

## Security and Privacy

- API keys stored securely using VSCode SecretStorage
- Optional authorization before sending code to AI
- Support for local/self-hosted models
- Sensitive information filtered from logs

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

[License information]

## Support

- **Documentation**: See [docs/](docs/) directory
- **Issues**: Report bugs on GitHub Issues
- **Discussions**: Join GitHub Discussions for questions

---

**Version**: 0.1.0  
**Last Updated**: 2024-01-01
