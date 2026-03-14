# Cowork Desktop App - Technical Documentation

## Project Overview and Purpose
Cowork is an Electron-based desktop application that provides a ChatGPT-like interface for interacting with Claude AI models. It's designed as a coding assistant with features tailored for developers including code syntax highlighting, file attachments, project scanning, conversation management, and error analysis capabilities.

## File Structure

```
desktop-app/
├── package.json              # Project manifest and dependencies
├── src/
│   ├── main.js              # Electron main process
│   ├── preload.js           # Context bridge for secure IPC
│   └── renderer/
│       ├── index.html       # UI structure
│       └── renderer.js      # Frontend logic
└── [utility scripts]        # Various fix/patch scripts
```

### Utility Scripts
- **check.js**: Searches for send button occurrences in HTML
- **fix-emojis.js**: Replaces broken emoji characters with Unicode entities
- **fix-modal-order.js**: Reorders API modal placement in HTML
- **fix-scan.js**: Adds file/directory exclusions to project scanning

## Architecture and Data Flow

### Process Architecture
1. **Main Process** (`main.js`):
   - Manages Electron app lifecycle
   - Handles file system operations
   - Manages Anthropic API client
   - Processes IPC messages from renderer

2. **Preload Script** (`preload.js`):
   - Exposes secure API bridge via `window.cowork`
   - Handles all IPC communication

3. **Renderer Process** (`renderer.js`):
   - Manages UI state and interactions
   - Handles conversation logic
   - Processes markdown and code highlighting

### Data Flow
```
User Input → Renderer → IPC → Main Process → Anthropic API
                ↓                    ↓
            Local State          Streaming Response
                ↓                    ↓
            UI Update ← IPC ← Chunked Messages
```

## Key Functions and Components

### Main Process (`main.js`)

#### Core Functions
- **createWindow()**: Initializes Electron window with security settings
- **loadApiKey()**: Retrieves stored API key from userData
- **IPC Handlers**:
  - `get/set-api-key`: API key management
  - `send-message`: Streams Claude responses
  - `open-file/folder`: File system dialogs
  - `save/load-conversations`: Persistence
  - `scan-project`: Analyzes project codebases
  - `compact-conversation`: Creates conversation summaries

#### Project Scanning Feature
- Recursively reads project files
- Filters by extensions: `.js`, `.ts`, `.jsx`, `.tsx`, `.html`, `.css`, `.json`, `.md`, `.py`, `.txt`
- Excludes: `node_modules`, `dist`, `.git`, build artifacts
- Truncates at 150K characters
- Generates AI-powered project briefing

### Renderer Process (`renderer.js`)

#### State Management
```javascript
state = {
    conversations: [],      // All conversations
    activeId: null,        // Current conversation ID
    systemPrompt: string,  // Claude system prompt
    attachment: null,      // File attachment
    savedMessages: []      // Bookmarked messages
}
```

#### Key Features
- **Conversation Management**: Create, switch, delete, export conversations
- **Message Rendering**: Markdown parsing with syntax highlighting
- **File Attachments**: Attach and preview code files
- **Error Analysis**: Dedicated modal for debugging assistance
- **Message Actions**: Copy, save, export individual messages
- **Saved Messages**: Bookmark important responses with tags
- **Project Scanning**: Generate project documentation
- **Conversation Compacting**: Create dense summaries

### UI Components (`index.html`)

#### Layout Structure
- **Sidebar**: Conversation list, settings, tools
- **Main Area**: Messages, input field, toolbar
- **Modals**: System prompt, API key, error analysis, saved messages

#### Styling Approach
- Dark theme optimized for coding
- Custom scrollbars
- Responsive design with min dimensions
- Hover states and transitions
- Code block styling with copy buttons

## Dependencies and Configuration

### Core Dependencies
- **electron**: v41.0.1 - Desktop framework
- **@anthropic-ai/sdk**: v0.78.0 - Claude API client
- **dotenv**: v17.3.1 - Environment variables

### External Libraries (CDN)
- **highlight.js**: v11.9.0 - Syntax highlighting
- **marked**: v9.1.6 - Markdown parsing

### Build Configuration
- **electron-builder**: v26.8.1
- Target: Windows NSIS installer
- App ID: `com.syntactyx.cowork`

## Known Patterns and Conventions

### Security Patterns
- Context isolation enabled
- No direct Node.js access in renderer
- All IPC through preload bridge
- CSP headers restricting external resources

### Code Patterns
- Functional approach with minimal classes
- Event-driven architecture
- Defensive error handling
- Stream-based API responses
- Local persistence in userData directory

### UI Patterns
- Toast notifications for user feedback
- Modal dialogs for complex inputs
- Inline message actions on hover
- Real-time typing indicator
- Keyboard shortcuts (Ctrl+E for error analysis)

## Suggested Next Steps and Improvements

### Feature Enhancements
1. **Multi-model Support**: Add GPT-4, local LLMs
2. **Code Execution**: Sandboxed code runner
3. **Plugin System**: Extensible architecture
4. **Team Collaboration**: Shared conversations
5. **Voice Input**: Speech-to-text integration

### Technical Improvements
1. **TypeScript Migration**: Type safety across codebase
2. **State Management**: Implement Redux/Zustand
3. **Testing Suite**: Unit and integration tests
4. **Performance**: Virtual scrolling for long conversations
5. **Accessibility**: Screen reader support, keyboard navigation

### Security Enhancements
1. **API Key Encryption**: Secure credential storage
2. **Update System**: Auto-updates with signature verification
3. **Audit Logging**: Track API usage and errors
4. **Rate Limiting**: Prevent API abuse

### UX Improvements
1. **Search**: Full-text search across conversations
2. **Themes**: Light mode, custom themes
3. **Export Options**: PDF, Word, various formats
4. **Code Templates**: Snippet management
5. **Diff Viewer**: Compare code versions

The application is well-structured for a v1.0 release with room for significant enhancement while maintaining its core purpose as a developer-focused AI assistant.