# Holo-Deck AI Assistant

Holo-Deck is a futuristic, voice-enabled AI coding assistant that helps you build, refactor, and run React Native Web applications directly in your browser. It features a stunning cyberpunk-inspired UI, real-time collaboration, and seamless Git integration.

## Features

- **Voice Commands (COMMS):** Speak your directives to the AI to generate or modify code.
- **Live Preview (HOLO-DECK):** See your React Native Web app update instantly as you or the AI write code.
- **Code Editor (DATA):** A built-in code editor with syntax highlighting for manual tweaks.
- **AI Refactoring & Generation:** Use the magic wand and sparkles tools to instantly generate new components or refactor existing ones.
- **Git Integration (SYNC):** Initialize repositories, stage changes, commit, pull, and push directly from the UI.
- **Real-Time Collaboration:** Multiple users can connect to the same session and see code changes, AI responses, and terminal output in real-time.

## Tech Stack

- **Frontend:** React 19, Vite, Tailwind CSS v4, Framer Motion, Lucide Icons
- **Backend:** Node.js, Express, WebSocket (ws)
- **AI:** Google Gemini 3.1 Pro via `@google/genai` SDK
- **Code Execution:** React Native Web, Vite Middleware

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- A Google Gemini API key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/holo-deck.git
   cd holo-deck
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory and add your Gemini API key:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:3000`.

## Usage

1. **Boot Sequence:** Wait for the system to initialize and connect to the uplink.
2. **Give a Directive:** Go to the COMMS tab, click the microphone, and describe what you want to build.
3. **Review Code:** Switch to the DATA tab to see the generated code. You can manually edit it or use the AI tools (Generate/Refactor) in the sidebar.
4. **Live Preview:** Switch to the RUN tab to see your app running in the Holo-Deck. Changes made in the editor will hot-reload automatically.
5. **Version Control:** Go to the SYNC tab to commit your changes to Git.

## Project Structure

- `src/App.tsx`: The main UI for the Holo-Deck assistant.
- `src/generated/App.tsx`: The target file where the AI writes the React Native Web application.
- `server.ts`: The Express backend that handles WebSockets, file system operations, Git commands, and serves the Vite app.
- `package.json`: Project dependencies and scripts.

## License

This project is licensed under the MIT License.
