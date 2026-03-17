import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Send,
  Play,
  Undo,
  Check,
  X,
  FileCode2,
  Terminal,
  RefreshCw,
  Sparkles,
  Cpu,
  Globe,
  Download,
  Search,
  ChevronRight,
  ChevronDown,
  GitBranch,
  GitCommitVertical,
  Save,
  Code2,
  AlignLeft,
  Upload,
  Wand2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-css';
import 'prismjs/themes/prism-tomorrow.css';
import * as prettier from 'prettier/standalone';
import * as prettierPluginEstree from 'prettier/plugins/estree';
import * as prettierPluginTypescript from 'prettier/plugins/typescript';
import * as prettierPluginBabel from 'prettier/plugins/babel';
import * as prettierPluginPostcss from 'prettier/plugins/postcss';
import GeneratedApp from './generated/App';

type Tab = 'Talk' | 'Review' | 'Apply' | 'Preview';

interface ToolCall {
  name: string;
  args: any;
  result?: any;
}

interface AgentEvent {
  type:
    | 'status'
    | 'agent_response'
    | 'tool_call'
    | 'file_updated'
    | 'error'
    | 'files'
    | 'tool_result'
    | 'sync_state';
  payload?: any;
  callId?: string;
  result?: any;
}

// Tool declarations for Gemini
const readFileTool: FunctionDeclaration = {
  name: 'readFile',
  description: 'Reads the content of a file in the project.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      path: {
        type: Type.STRING,
        description:
          'The path of the file to read relative to project root (e.g., src/generated/App.tsx)',
      },
    },
    required: ['path'],
  },
};

const editFileTool: FunctionDeclaration = {
  name: 'editFile',
  description: 'Edits the content of a file in the project.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      path: {
        type: Type.STRING,
        description: 'The path of the file to edit relative to project root',
      },
      content: {
        type: Type.STRING,
        description: 'The new content of the file',
      },
    },
    required: ['path', 'content'],
  },
};

const runShellTool: FunctionDeclaration = {
  name: 'runShell',
  description: 'Runs a shell command in the project directory.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      command: {
        type: Type.STRING,
        description: 'The shell command to run',
      },
    },
    required: ['command'],
  },
};

const gitStatusTool: FunctionDeclaration = {
  name: 'gitStatus',
  description: 'Gets the current git status of the project.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

const gitAddTool: FunctionDeclaration = {
  name: 'gitAdd',
  description: 'Stages files for commit.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      files: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'List of files to stage. Defaults to all files if empty.',
      },
    },
  },
};

const gitCommitTool: FunctionDeclaration = {
  name: 'gitCommit',
  description: 'Commits staged changes.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      message: {
        type: Type.STRING,
        description: 'The commit message.',
      },
    },
    required: ['message'],
  },
};

const gitPullTool: FunctionDeclaration = {
  name: 'gitPull',
  description: 'Pulls changes from remote repository.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

const gitPushTool: FunctionDeclaration = {
  name: 'gitPush',
  description: 'Pushes changes to remote repository.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-red-500 font-mono text-xs">
          <h1>Preview Error</h1>
          <pre>{this.state.error?.toString()}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function PreviewApp() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
      }}
    >
      <GeneratedApp />
    </div>
  );
}

export default function Main() {
  if (window.location.pathname === '/preview') {
    return (
      <ErrorBoundary>
        <PreviewApp />
      </ErrorBoundary>
    );
  }
  return <AgentUI />;
}

function AgentUI() {
  const [activeTab, setActiveTab] = useState<Tab>('Talk');
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [status, setStatus] = useState('SYSTEM STANDBY');
  const [agentResponses, setAgentResponses] = useState<string[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [files, setFiles] = useState<Record<string, string>>({});
  const [isBooting, setIsBooting] = useState(true);
  const [bootStep, setBootStep] = useState(0);
  const [syncStatus, setSyncStatus] = useState<{
    path: string;
    status: 'syncing' | 'success' | 'error';
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [gitInfo, setGitInfo] = useState<{ branch: string; status: string }>({
    branch: 'main',
    status: '',
  });
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [refactorConfirm, setRefactorConfirm] = useState<{
    code: string;
    file: string;
  } | null>(null);
  const [generatePrompt, setGeneratePrompt] = useState<{
    isOpen: boolean;
    text: string;
  }>({ isOpen: false, text: '' });
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isAutosaveEnabled, setIsAutosaveEnabled] = useState(false);
  const [isRefactoring, setIsRefactoring] = useState(false);
  const [isSnippetManagerOpen, setIsSnippetManagerOpen] = useState(false);
  const [snippets, setSnippets] = useState([
    {
      id: '1',
      name: 'React Component',
      code: "import React from 'react';\n\nexport default function Component() {\n  return (\n    <div>\n      \n    </div>\n  );\n}",
    },
    {
      id: '2',
      name: 'useEffect Hook',
      code: 'useEffect(() => {\n  \n  return () => {\n    \n  };\n}, []);',
    },
    {
      id: '3',
      name: 'Tailwind Button',
      code: '<button className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg transition-all">\n  Click Me\n</button>',
    },
  ]);

  const wsRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<any>(null);
  const pendingToolCalls = useRef<Map<string, (result: any) => void>>(
    new Map(),
  );

  const BOOT_SEQUENCE = [
    'INITIALIZING NEURAL LINK...',
    'ESTABLISHING SECURE CONNECTION...',
    'LOADING QUANTUM MODULES...',
    'CALIBRATING VOICE SENSORS...',
    'SYSTEM READY.',
  ];

  useEffect(() => {
    if (bootStep < BOOT_SEQUENCE.length) {
      const timer = setTimeout(() => {
        setBootStep((prev) => prev + 1);
      }, 800); // 800ms per step
      return () => clearTimeout(timer);
    } else {
      setTimeout(() => setIsBooting(false), 500);
    }
  }, [bootStep]);

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: any;

    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('Connected to server');
        setStatus('UPLINK ESTABLISHED');
      };

      ws.onmessage = (event) => {
        try {
          const data: AgentEvent = JSON.parse(event.data);

          if (data.type === 'file_updated') {
            setFiles((prev) => ({
              ...prev,
              [data.payload.path]: data.payload.content,
            }));
            setSyncStatus({ path: data.payload.path, status: 'success' });
            setTimeout(() => setSyncStatus(null), 3000);
          } else if (data.type === 'files') {
            setFiles(data.payload || {});
          } else if (data.type === 'tool_result' && data.callId) {
            const resolve = pendingToolCalls.current.get(data.callId);
            if (resolve) {
              resolve(data.result);
              pendingToolCalls.current.delete(data.callId);
            }
          } else if (data.type === 'sync_state') {
            if (data.payload.type === 'transcript')
              setTranscript(data.payload.payload);
            else if (data.payload.type === 'status')
              setStatus(data.payload.payload);
            else if (data.payload.type === 'agent_response')
              setAgentResponses((prev) => [...prev, data.payload.payload]);
            else if (data.payload.type === 'agent_response_update') {
              setAgentResponses((prev) => {
                const newResponses = [...prev];
                if (newResponses.length > 0) {
                  newResponses[newResponses.length - 1] = data.payload.payload;
                } else {
                  newResponses.push(data.payload.payload);
                }
                return newResponses;
              });
            } else if (data.payload.type === 'agent_response_clear')
              setAgentResponses([]);
            else if (data.payload.type === 'tool_call')
              setToolCalls((prev) => [...prev, data.payload.payload]);
            else if (data.payload.type === 'tool_call_clear') setToolCalls([]);
            else if (data.payload.type === 'tool_call_result') {
              setToolCalls((prev) =>
                prev.map((c) =>
                  c.name === data.payload.payload.name &&
                  JSON.stringify(c.args) ===
                    JSON.stringify(data.payload.payload.args)
                    ? { ...c, result: data.payload.payload.result }
                    : c,
                ),
              );
            } else if (data.payload.type === 'activeTab')
              setActiveTab(data.payload.payload);
            else if (data.payload.type === 'isRecording')
              setIsRecording(data.payload.payload);
          }
        } catch (e) {
          console.error('Error parsing message', e);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket closed, attempting to reconnect...');
        setStatus('ERR: UPLINK OFFLINE');
        reconnectTimer = setTimeout(connectWs, 3000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
      };

      wsRef.current = ws;
    };

    connectWs();

    // Initialize Speech Recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setTranscript((prev) => {
            const updated = (prev + ' ' + finalTranscript).trim();
            broadcastState('transcript', updated);
            return updated;
          });
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Live preview (hot reload) logic
  useEffect(() => {
    if (!selectedFile || !files[selectedFile]) return;

    const timeout = setTimeout(() => {
      console.log(`Live preview syncing ${selectedFile}...`);
      wsRef.current?.send(
        JSON.stringify({
          type: 'execute_tool',
          callId: 'live-preview-' + Date.now(),
          name: 'editFile',
          args: { path: selectedFile, content: files[selectedFile] },
        }),
      );
      setLastSaved(new Date());
    }, 500); // 500ms debounce

    return () => clearTimeout(timeout);
  }, [selectedFile, files[selectedFile]]);

  // Autosave logic (kept for explicit toggle if needed, or we can just rely on live preview)
  useEffect(() => {
    if (!isAutosaveEnabled) return;

    const interval = setInterval(() => {
      if (selectedFile && files[selectedFile]) {
        console.log(`Autosaving ${selectedFile}...`);
        wsRef.current?.send(
          JSON.stringify({
            type: 'execute_tool',
            callId: 'autosave-' + Date.now(),
            name: 'editFile',
            args: { path: selectedFile, content: files[selectedFile] },
          }),
        );
        setLastSaved(new Date());
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [selectedFile, files, isAutosaveEnabled]);

  // Initial git status
  useEffect(() => {
    if (!isBooting) {
      executeTool('gitStatus', {}).then((res) => {
        if (res.output) {
          const branchMatch = res.output.match(/On branch (.*)/);
          setGitInfo({
            branch: branchMatch ? branchMatch[1] : 'main',
            status: res.output,
          });
        }
      });
    }
  }, [isBooting]);

  const broadcastState = (type: string, payload: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'broadcast',
          payload: { type: 'sync_state', payload: { type, payload } },
        }),
      );
    }
  };

  const setStatusAndBroadcast = (newStatus: string) => {
    setStatus(newStatus);
    broadcastState('status', newStatus);
  };

  const setTranscriptAndBroadcast = (newTranscript: string) => {
    setTranscript(newTranscript);
    broadcastState('transcript', newTranscript);
  };

  const setActiveTabAndBroadcast = (newTab: Tab) => {
    setActiveTab(newTab);
    broadcastState('activeTab', newTab);
  };

  const handleFormat = async () => {
    if (!selectedFile) return;
    try {
      const code = files[selectedFile];
      let formatted = code;

      const parser = selectedFile.endsWith('.css') ? 'postcss' : 'typescript';
      const plugins = [
        prettierPluginEstree,
        prettierPluginTypescript,
        prettierPluginBabel,
        prettierPluginPostcss,
      ];

      formatted = await prettier.format(code, {
        parser,
        plugins,
        semi: true,
        singleQuote: true,
        trailingComma: 'all',
      });

      setFiles((prev) => ({ ...prev, [selectedFile]: formatted }));
      setStatusAndBroadcast('CODE REFORMATTED');
    } catch (e: any) {
      console.error('Format error:', e);
      setStatusAndBroadcast(`FORMAT ERR: ${e.message}`);
    }
  };

  const handleAIGenerate = async (description: string) => {
    if (!selectedFile) return;
    setStatusAndBroadcast('AI GENERATING CODE...');
    try {
      const ai = new GoogleGenAI({
        apiKey:
          (import.meta as any).env.VITE_GEMINI_API_KEY ||
          process.env.GEMINI_API_KEY ||
          '',
      });
      const result = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Generate code based on this description: ${description}`,
              },
            ],
          },
        ],
      });
      const generatedCode = result.text
        .replace(/^```[a-z]*\n/i, '')
        .replace(/\n```$/i, '');
      setFiles((prev) => ({
        ...prev,
        [selectedFile]: (prev[selectedFile] || '') + '\n' + generatedCode,
      }));
      setStatusAndBroadcast('AI CODE GENERATED');
    } catch (e: any) {
      setStatusAndBroadcast(`GEN ERR: ${e.message}`);
    }
  };

  const handleAIRefactor = async () => {
    if (!selectedFile) return;
    setIsRefactoring(true);
    setStatusAndBroadcast('AI REFACTORING SECTOR...');

    try {
      const ai = new GoogleGenAI({
        apiKey:
          (import.meta as any).env.VITE_GEMINI_API_KEY ||
          process.env.GEMINI_API_KEY ||
          '',
      });

      const prompt = `Refactor and improve the following code from file "${selectedFile}". 
Fix any bugs, improve performance, and ensure it follows best practices. 
Return ONLY the refactored code, no explanations.

Code:
${files[selectedFile]}`;

      const result = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const refactoredCode = result.text
        .replace(/^```[a-z]*\n/i, '')
        .replace(/\n```$/i, '');

      setRefactorConfirm({ code: refactoredCode, file: selectedFile });
    } catch (e: any) {
      console.error('Refactor error:', e);
      setStatusAndBroadcast(`REFACTOR ERR: ${e.message}`);
    } finally {
      setIsRefactoring(false);
    }
  };

  const setIsRecordingAndBroadcast = (recording: boolean) => {
    setIsRecording(recording);
    broadcastState('isRecording', recording);
  };

  const toggleRecording = () => {
    if (isRecording) {
      try {
        recognitionRef.current?.stop();
      } catch (e) {
        console.error('Error stopping recognition', e);
      }
      setIsRecordingAndBroadcast(false);
    } else {
      setTranscriptAndBroadcast('');
      try {
        if (recognitionRef.current) {
          recognitionRef.current.start();
          setIsRecordingAndBroadcast(true);
        } else {
          setStatusAndBroadcast('AUDIO INTERFACE OFFLINE');
        }
      } catch (e: any) {
        console.error('Error starting recognition', e);
        if (e.name === 'NotAllowedError') {
          setStatusAndBroadcast('MIC ACCESS DENIED');
        } else if (e.name === 'InvalidStateError') {
          setIsRecordingAndBroadcast(true);
        } else {
          setStatusAndBroadcast('AUDIO SENSOR ERROR');
        }
        if (e.name !== 'InvalidStateError') {
          setIsRecordingAndBroadcast(false);
        }
      }
    }
  };

  const executeTool = (name: string, args: any): Promise<any> => {
    return new Promise((resolve) => {
      const callId = Math.random().toString(36).substring(7);
      pendingToolCalls.current.set(callId, resolve);
      wsRef.current?.send(
        JSON.stringify({ type: 'execute_tool', callId, name, args }),
      );
    });
  };

  const sendPrompt = async () => {
    if (!transcript.trim()) return;

    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      setStatusAndBroadcast('ERR: UPLINK OFFLINE');
      return;
    }

    setAgentResponses([]);
    broadcastState('agent_response_clear', null);
    setToolCalls([]);
    broadcastState('tool_call_clear', null);
    setStatusAndBroadcast('PROCESSING DIRECTIVE...');
    setActiveTabAndBroadcast('Review');

    const prompt = transcript;

    try {
      // Initialize Gemini API here on the frontend
      const ai = new GoogleGenAI({
        apiKey:
          (import.meta as any).env.VITE_GEMINI_API_KEY ||
          process.env.GEMINI_API_KEY ||
          '',
      });

      const systemInstruction = `You are a Voice PM and mobile coding agent.
You have access to the real file system. The user's React Native app entry point is at 'src/generated/App.tsx'.
You must edit 'src/generated/App.tsx' to fulfill the user's request.
The environment supports React Native Web, so you can import from 'react-native'.

CRITICAL: You MUST always explain your plan first in text before executing any tool calls. 
Every response that contains a function call MUST also contain a text part preceding it.
Never output a function call without a preceding text thought.

When you are done, summarize what changed.`;

      const tools = [
        {
          functionDeclarations: [
            readFileTool,
            editFileTool,
            runShellTool,
            gitStatusTool,
            gitAddTool,
            gitCommitTool,
            gitPullTool,
            gitPushTool,
          ],
        },
      ];
      let history: any[] = [{ role: 'user', parts: [{ text: prompt }] }];

      let loopCount = 0;
      while (loopCount < 10) {
        loopCount++;

        setStatusAndBroadcast('THINKING...');
        const responseStream = await ai.models.generateContentStream({
          model: 'gemini-3.1-pro-preview',
          contents: history,
          config: {
            systemInstruction,
            tools,
          },
        });

        let currentResponseText = '';
        let currentFunctionCalls: any[] = [];
        let modelParts: any[] = [];

        setAgentResponses((prev) => [...prev, '']);
        broadcastState('agent_response', '');

        for await (const chunk of responseStream) {
          const parts = chunk.candidates?.[0]?.content?.parts || [];

          for (const part of parts) {
            if (part.text !== undefined) {
              currentResponseText += part.text;
              setAgentResponses((prev) => {
                const newResponses = [...prev];
                newResponses[newResponses.length - 1] = currentResponseText;
                return newResponses;
              });
              broadcastState('agent_response_update', currentResponseText);
            } else if (part.functionCall !== undefined) {
              currentFunctionCalls.push(part.functionCall);
            }

            const partKeys = Object.keys(part);
            const primaryKey = partKeys.length > 0 ? partKeys[0] : null;

            const lastPart = modelParts[modelParts.length - 1];
            if (
              lastPart &&
              primaryKey &&
              Object.keys(lastPart)[0] === primaryKey &&
              typeof (part as any)[primaryKey] === 'string'
            ) {
              (lastPart as any)[primaryKey] += (part as any)[primaryKey];
            } else {
              modelParts.push(JSON.parse(JSON.stringify(part)));
            }
          }
        }

        history.push({
          role: 'model',
          parts: modelParts,
        });

        if (currentFunctionCalls.length === 0) {
          break; // Done
        }

        const functionResponses: any[] = [];

        for (const call of currentFunctionCalls) {
          setToolCalls((prev) => [
            ...prev,
            { name: call.name, args: call.args },
          ]);
          broadcastState('tool_call', { name: call.name, args: call.args });

          setStatusAndBroadcast(`EXECUTING TOOL: ${call.name}...`);
          // Execute tool via WebSocket to backend
          const result = await executeTool(call.name, call.args);

          if (call.name === 'editFile') {
            setFiles(prev => ({ ...prev, [call.args.path]: call.args.content }));
          } else if (call.name === 'readFile' && result.content) {
            setFiles(prev => ({ ...prev, [call.args.path]: result.content }));
          }

          setToolCalls((prev) =>
            prev.map((c) =>
              c.name === call.name &&
              JSON.stringify(c.args) === JSON.stringify(call.args)
                ? { ...c, result }
                : c,
            ),
          );
          broadcastState('tool_call_result', {
            name: call.name,
            args: call.args,
            result,
          });

          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: result,
            },
          });
        }

        history.push({
          role: 'user',
          parts: functionResponses,
        });
      }

      setStatusAndBroadcast('DIRECTIVE COMPLETE');
      setActiveTabAndBroadcast('Apply');
    } catch (error: any) {
      console.error('Agent error:', error);
      setStatusAndBroadcast(`SYS ERR: ${error.message || String(error)}`);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#030712] text-cyan-50 font-sans w-full max-w-md mx-auto border-x border-cyan-900/30 shadow-[0_0_50px_rgba(8,145,178,0.1)] overflow-hidden relative">
      {/* Snippet Manager Modal */}
      <AnimatePresence>
        {isSnippetManagerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-gray-900 border border-cyan-500/30 rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col gap-4"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-light text-white tracking-widest uppercase">
                  Snippet Library
                </h2>
                <button
                  onClick={() => setIsSnippetManagerOpen(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <input
                type="text"
                placeholder="Search snippets..."
                className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white font-mono text-sm"
              />
              <div className="flex-1 overflow-y-auto space-y-2">
                {snippets.map((s) => (
                  <div
                    key={s.id}
                    className="bg-gray-800 p-3 rounded-lg flex justify-between items-center"
                  >
                    <span className="text-cyan-300 font-mono text-sm">
                      {s.name}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (selectedFile) {
                            setFiles((prev) => ({
                              ...prev,
                              [selectedFile]:
                                (prev[selectedFile] || '') + '\n' + s.code,
                            }));
                            setIsSnippetManagerOpen(false);
                          }
                        }}
                        className="text-xs bg-cyan-500/20 text-cyan-300 px-2 py-1 rounded"
                      >
                        Insert
                      </button>
                      <button
                        onClick={() =>
                          setSnippets((prev) =>
                            prev.filter((p) => p.id !== s.id),
                          )
                        }
                        className="text-xs bg-red-500/20 text-red-300 px-2 py-1 rounded"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Boot Sequence Overlay */}
      <AnimatePresence>
        {isBooting && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="absolute inset-0 z-50 bg-[#030712] flex flex-col items-center justify-center p-8"
          >
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-[conic-gradient(from_90deg_at_50%_50%,#00000000_50%,#06b6d4_100%)] animate-[spin_4s_linear_infinite] opacity-20 blur-3xl"></div>
            </div>

            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="relative w-24 h-24 mb-12 z-10"
            >
              <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20"></div>
              <div className="absolute inset-0 rounded-full border-t-2 border-cyan-400 animate-[spin_2s_linear_infinite]"></div>
              <div className="absolute inset-2 rounded-full border-2 border-indigo-500/20"></div>
              <div className="absolute inset-2 rounded-full border-b-2 border-indigo-400 animate-[spin_3s_linear_infinite_reverse]"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Cpu className="w-8 h-8 text-cyan-300 animate-pulse" />
              </div>
            </motion.div>

            <div className="w-full max-w-xs space-y-3 z-10">
              {BOOT_SEQUENCE.map((step, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{
                    opacity: index <= bootStep ? 1 : 0,
                    x: index <= bootStep ? 0 : -20,
                  }}
                  className="flex items-center gap-3 font-mono text-xs"
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${index < bootStep ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]' : index === bootStep ? 'bg-indigo-400 animate-pulse' : 'bg-gray-800'}`}
                  ></div>
                  <span
                    className={
                      index < bootStep
                        ? 'text-cyan-300'
                        : index === bootStep
                          ? 'text-indigo-300'
                          : 'text-gray-600'
                    }
                  >
                    {step}
                  </span>
                </motion.div>
              ))}
            </div>

            <div className="absolute bottom-10 left-0 right-0 flex justify-center z-10">
              <div className="w-48 h-1 bg-gray-900 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500"
                  initial={{ width: '0%' }}
                  animate={{
                    width: `${(Math.min(bootStep, BOOT_SEQUENCE.length) / BOOT_SEQUENCE.length) * 100}%`,
                  }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cinematic Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[120%] h-[50%] bg-cyan-900/20 blur-[120px] rounded-full mix-blend-screen"></div>
        <div className="absolute bottom-[-10%] right-[-20%] w-[80%] h-[60%] bg-indigo-900/20 blur-[100px] rounded-full mix-blend-screen"></div>
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')] opacity-30 mix-blend-overlay"></div>
      </div>

      {/* Header */}
      <header className="bg-black/40 backdrop-blur-xl border-b border-cyan-500/20 p-4 flex items-center justify-between z-10 relative shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-10 h-10 shrink-0 rounded-full bg-cyan-950 border border-cyan-500/50 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <div className="absolute inset-0 rounded-full border border-cyan-400/30 animate-[spin_4s_linear_infinite]"></div>
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-lg tracking-widest uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400 truncate">
              Voice PM
            </h1>
            <div className="text-[9px] font-mono text-cyan-500/80 tracking-widest uppercase truncate">
              V2.0 // Neural Link
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 max-w-[40%] sm:max-w-[50%]">
          <div
            className="text-[10px] font-mono text-cyan-300 bg-cyan-950/50 border border-cyan-500/30 px-3 py-1.5 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.2)] truncate w-full text-right"
            title={status}
          >
            {status}
          </div>
          <AnimatePresence>
            {syncStatus && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-[9px] font-mono text-green-400 flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> SYNCED:{' '}
                {syncStatus.path.split('/').pop()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden relative z-10">
        {/* Sidebar */}
        <AnimatePresence>
          {isSidebarOpen && (
            <motion.aside
              initial={{ x: -240, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -240, opacity: 0 }}
              className="absolute left-0 top-0 bottom-0 w-[240px] bg-black/90 backdrop-blur-xl border-r border-cyan-900/30 flex flex-col overflow-hidden z-40 shadow-[10px_0_30px_rgba(0,0,0,0.5)]"
            >
              <div className="p-4 pb-28 space-y-4 flex-1 flex flex-col overflow-hidden">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-cyan-700" />
                  <input
                    type="text"
                    placeholder="SEARCH DATA..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-cyan-950/30 border border-cyan-900/50 rounded-lg pl-8 pr-3 py-2 text-[10px] font-mono text-cyan-100 focus:outline-none focus:border-cyan-500/50 placeholder-cyan-900/50"
                  />
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-hide space-y-6">
                  <div>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <ChevronDown className="w-3 h-3 text-cyan-500" />
                      <span className="text-[9px] font-mono text-cyan-500 uppercase tracking-widest">
                        Project Files
                      </span>
                    </div>
                    <FileTree
                      files={files}
                      selectedFile={selectedFile}
                      onSelect={setSelectedFile}
                      searchQuery={searchQuery}
                    />
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <Code2 className="w-3 h-3 text-indigo-400" />
                      <span className="text-[9px] font-mono text-indigo-400 uppercase tracking-widest">
                        Snippets
                      </span>
                    </div>
                    <div className="space-y-1">
                      {snippets.map((snippet) => (
                        <button
                          key={snippet.id}
                          onClick={() => {
                            if (selectedFile) {
                              setFiles((prev) => ({
                                ...prev,
                                [selectedFile]:
                                  (prev[selectedFile] || '') +
                                  '\n' +
                                  snippet.code,
                              }));
                              setStatusAndBroadcast(
                                `INSERTED: ${snippet.name}`,
                              );
                            }
                          }}
                          className="w-full text-left px-3 py-2 text-[10px] font-mono text-cyan-600 hover:bg-cyan-950/20 hover:text-cyan-400 rounded-lg truncate transition-all"
                        >
                          {snippet.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-cyan-900/30 space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[9px] font-mono text-cyan-700 uppercase tracking-widest">
                      Autosave
                    </span>
                    <button
                      onClick={() => setIsAutosaveEnabled(!isAutosaveEnabled)}
                      className={`w-8 h-4 rounded-full relative transition-colors ${isAutosaveEnabled ? 'bg-cyan-500' : 'bg-gray-800'}`}
                    >
                      <div
                        className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${isAutosaveEnabled ? 'left-4.5' : 'left-0.5'}`}
                      ></div>
                    </button>
                  </div>
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <GitBranch className="w-3 h-3 text-indigo-400" />
                      <span className="text-[9px] font-mono text-indigo-400 uppercase tracking-widest">
                        {gitInfo.branch}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          executeTool('gitPull', {}).then((res) =>
                            setStatusAndBroadcast(
                              res.error ? `PULL ERR: ${res.error}` : 'PULLED',
                            ),
                          );
                        }}
                        className="p-1 hover:text-indigo-300 transition-colors"
                      >
                        <Download className="w-2.5 h-2.5" />
                      </button>
                      <button
                        onClick={() => {
                          executeTool('gitPush', {}).then((res) =>
                            setStatusAndBroadcast(
                              res.error ? `PUSH ERR: ${res.error}` : 'PUSHED',
                            ),
                          );
                        }}
                        className="p-1 hover:text-indigo-300 transition-colors"
                      >
                        <Upload className="w-2.5 h-2.5" />
                      </button>
                      <button
                        onClick={() => {
                          executeTool('gitStatus', {}).then((res) =>
                            setGitInfo((prev) => ({
                              ...prev,
                              status: res.output || res.error,
                            })),
                          );
                        }}
                        className="p-1 hover:text-indigo-300 transition-colors"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>

                  {gitInfo.status?.includes('not a git repository') ? (
                    <button
                      onClick={() => {
                        setStatusAndBroadcast('INITIALIZING GIT...');
                        executeTool('gitInit', {}).then((res) => {
                          setStatusAndBroadcast(
                            res.error
                              ? `INIT ERR: ${res.error}`
                              : 'GIT INITIALIZED',
                          );
                          executeTool('gitStatus', {}).then((s) =>
                            setGitInfo((prev) => ({
                              ...prev,
                              status: s.output,
                            })),
                          );
                        });
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg py-2 text-[9px] font-mono text-indigo-300 uppercase tracking-widest transition-all mt-2"
                    >
                      <GitBranch className="w-3 h-3" /> Initialize Git
                    </button>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {isCommitting ? (
                        <div className="flex flex-col gap-2">
                          <input
                            type="text"
                            value={commitMessage}
                            onChange={(e) => setCommitMessage(e.target.value)}
                            placeholder="Commit message..."
                            className="w-full bg-black/50 border border-indigo-500/30 rounded px-2 py-1.5 text-[10px] text-indigo-100 font-mono outline-none focus:border-indigo-400"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && commitMessage) {
                                setStatusAndBroadcast('STAGING FILES...');
                                executeTool('gitAdd', { files: [] }).then(
                                  () => {
                                    setStatusAndBroadcast('COMMITTING...');
                                    executeTool('gitCommit', {
                                      message: commitMessage,
                                    }).then((res) => {
                                      setStatusAndBroadcast(
                                        res.error
                                          ? `COMMIT ERR: ${res.error}`
                                          : 'COMMITTED',
                                      );
                                      executeTool('gitStatus', {}).then((s) =>
                                        setGitInfo((prev) => ({
                                          ...prev,
                                          status: s.output,
                                        })),
                                      );
                                      setIsCommitting(false);
                                      setCommitMessage('');
                                    });
                                  },
                                );
                              } else if (e.key === 'Escape') {
                                setIsCommitting(false);
                              }
                            }}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => setIsCommitting(false)}
                              className="flex-1 py-1 text-[9px] font-mono text-gray-400 hover:text-gray-200 uppercase tracking-widest transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              disabled={!commitMessage}
                              onClick={() => {
                                setStatusAndBroadcast('STAGING FILES...');
                                executeTool('gitAdd', { files: [] }).then(
                                  () => {
                                    setStatusAndBroadcast('COMMITTING...');
                                    executeTool('gitCommit', {
                                      message: commitMessage,
                                    }).then((res) => {
                                      setStatusAndBroadcast(
                                        res.error
                                          ? `COMMIT ERR: ${res.error}`
                                          : 'COMMITTED',
                                      );
                                      executeTool('gitStatus', {}).then((s) =>
                                        setGitInfo((prev) => ({
                                          ...prev,
                                          status: s.output,
                                        })),
                                      );
                                      setIsCommitting(false);
                                      setCommitMessage('');
                                    });
                                  },
                                );
                              }}
                              className="flex-1 bg-indigo-500/20 hover:bg-indigo-500/30 disabled:opacity-50 disabled:hover:bg-indigo-500/20 border border-indigo-500/30 rounded py-1 text-[9px] font-mono text-indigo-300 uppercase tracking-widest transition-all"
                            >
                              Confirm
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setIsCommitting(true)}
                          className="w-full flex items-center justify-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg py-2 text-[9px] font-mono text-indigo-300 uppercase tracking-widest transition-all"
                        >
                          <GitCommitVertical className="w-3 h-3" /> Stage &
                          Commit
                        </button>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => window.open('/api/export-zip', '_blank')}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg py-2 text-[9px] font-mono text-indigo-300 uppercase tracking-widest transition-all mt-2"
                  >
                    <Download className="w-3 h-3" /> Export Source
                  </button>
                  <button
                    onClick={() => setIsSnippetManagerOpen(true)}
                    className="w-full flex items-center justify-center gap-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg py-2 text-[9px] font-mono text-cyan-300 uppercase tracking-widest transition-all mt-2"
                  >
                    <Code2 className="w-3 h-3" /> Snippet Library
                  </button>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <div className="flex-1 flex flex-col overflow-hidden p-5 pb-28 relative">
          <motion.button
            animate={{ left: isSidebarOpen ? 240 : 0 }}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="absolute top-1/2 -translate-y-1/2 z-50 bg-cyan-950/90 border border-cyan-500/50 rounded-r-lg p-2 text-cyan-400 hover:text-cyan-200 hover:bg-cyan-900 transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)] cursor-pointer"
          >
            {isSidebarOpen ? (
              <ChevronRight className="w-4 h-4 rotate-180" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </motion.button>

          <AnimatePresence mode="wait">
            {activeTab === 'Talk' && (
              <motion.div
                key="Talk"
                initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col h-full overflow-y-auto scrollbar-hide p-4 gap-10 items-center justify-center"
              >
                <div className="text-center space-y-3">
                  <h2 className="text-3xl font-light tracking-tight text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                    Awaiting Directive
                  </h2>
                  <p className="text-cyan-500/70 text-sm font-mono uppercase tracking-widest animate-pulse">
                    Initialize Voice Protocol
                  </p>
                </div>

                <div className="relative group flex flex-col items-center">
                  {isRecording && (
                    <>
                      <div className="absolute inset-0 bg-cyan-500 rounded-full blur-[40px] opacity-40 animate-pulse"></div>
                      <div className="absolute -inset-4 border border-cyan-500/30 rounded-full animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
                      <div className="absolute -inset-8 border border-cyan-500/10 rounded-full animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
                    </>
                  )}
                  <button
                    onClick={toggleRecording}
                    className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 overflow-hidden ${isRecording ? 'bg-cyan-950 border-2 border-cyan-400 shadow-[0_0_50px_rgba(6,182,212,0.6)] scale-105' : 'bg-black/50 border border-cyan-900/50 hover:border-cyan-500/50 hover:shadow-[0_0_30px_rgba(6,182,212,0.2)]'}`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent"></div>
                    {isRecording ? (
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                      >
                        <Mic className="w-12 h-12 text-cyan-400 drop-shadow-[0_0_10px_rgba(6,182,212,0.8)]" />
                      </motion.div>
                    ) : (
                      <MicOff className="w-12 h-12 text-cyan-800 group-hover:text-cyan-500 transition-colors" />
                    )}
                  </button>

                  {/* Visual Equalizer when recording */}
                  <AnimatePresence>
                    {isRecording && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute -bottom-12 flex items-end gap-1.5 h-6"
                      >
                        {[...Array(7)].map((_, i) => (
                          <motion.div
                            key={i}
                            className="w-1.5 bg-cyan-400 rounded-full shadow-[0_0_8px_rgba(6,182,212,0.8)]"
                            animate={{ height: ['20%', '100%', '20%'] }}
                            transition={{
                              repeat: Infinity,
                              duration: 0.4 + Math.random() * 0.4,
                              ease: 'easeInOut',
                            }}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="w-full max-w-sm mt-4">
                  <div className="bg-black/40 backdrop-blur-md border border-cyan-900/50 hover:border-cyan-500/40 rounded-2xl p-5 min-h-[140px] relative shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] transition-colors">
                    <div className="absolute top-0 left-4 -translate-y-1/2 bg-[#030712] px-2 text-[10px] font-mono text-cyan-600 tracking-widest flex items-center gap-2">
                      <Terminal className="w-3 h-3" /> TRANSCRIPT
                    </div>

                    {transcript && (
                      <button
                        onClick={() => setTranscriptAndBroadcast('')}
                        className="absolute top-3 right-3 text-cyan-900 hover:text-cyan-400 transition-colors"
                        title="Clear Transcript"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}

                    <textarea
                      className="w-full bg-transparent text-cyan-100 font-light leading-relaxed resize-none focus:outline-none placeholder-cyan-900/60 h-full min-h-[100px] mt-2"
                      placeholder='"Design a holographic dashboard..."'
                      value={transcript}
                      onChange={(e) =>
                        setTranscriptAndBroadcast(e.target.value)
                      }
                    />

                    {transcript && !isRecording && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={sendPrompt}
                        className="absolute -bottom-5 right-5 bg-cyan-500 hover:bg-cyan-400 text-black p-4 rounded-full shadow-[0_0_20px_rgba(6,182,212,0.5)] transition-all hover:scale-110 group"
                      >
                        <Sparkles className="w-5 h-5 group-hover:animate-pulse" />
                      </motion.button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'Review' && (
              <motion.div
                key="Review"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex-1 overflow-y-auto scrollbar-hide space-y-8 pb-4 p-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-cyan-900/50 pb-2">
                    <Globe className="w-4 h-4 text-cyan-500" />
                    <h3 className="text-[11px] font-mono text-cyan-400 uppercase tracking-widest">
                      Neural Link Stream
                    </h3>
                  </div>
                  {agentResponses.length === 0 ? (
                    <div className="bg-black/30 border border-cyan-900/30 rounded-xl p-5 text-cyan-700 font-mono text-xs animate-pulse flex items-center gap-3">
                      <div className="w-2 h-2 bg-cyan-500 rounded-full"></div>
                      Awaiting telemetry...
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {agentResponses.map((res, i) => (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          key={i}
                          className="bg-black/40 backdrop-blur-sm border border-cyan-800/40 rounded-xl p-5 text-sm font-light text-cyan-100 whitespace-pre-wrap shadow-[0_4px_20px_rgba(0,0,0,0.2)] relative overflow-hidden"
                        >
                          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-cyan-400 to-indigo-500"></div>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></div>
                            <span className="text-[10px] font-mono text-cyan-500 uppercase tracking-widest">
                              Thought Process
                            </span>
                          </div>
                          <div className="pl-3 border-l border-cyan-900/30">
                            {res}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-cyan-900/50 pb-2">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-[11px] font-mono text-indigo-400 uppercase tracking-widest">
                      System Operations
                    </h3>
                  </div>
                  {toolCalls.length === 0 ? (
                    <div className="text-cyan-900/50 text-xs font-mono italic">
                      No operations executed.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {toolCalls.map((call, i) => (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          key={i}
                          className="flex items-start gap-4 bg-indigo-950/20 border border-indigo-500/20 rounded-xl p-4 relative overflow-hidden"
                        >
                          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-50"></div>
                          {call.name === 'readFile' ||
                          call.name === 'editFile' ? (
                            <FileCode2 className="w-5 h-5 text-cyan-400 mt-0.5" />
                          ) : (
                            <Terminal className="w-5 h-5 text-indigo-400 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                                {call.name}
                              </div>
                              {!call.result && (
                                <div className="flex items-center gap-1 text-[9px] font-mono text-indigo-400 animate-pulse">
                                  <div className="w-1 h-1 bg-indigo-400 rounded-full"></div>
                                  <div className="w-1 h-1 bg-indigo-400 rounded-full animation-delay-100"></div>
                                  <div className="w-1 h-1 bg-indigo-400 rounded-full animation-delay-200"></div>
                                  EXECUTING
                                </div>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-cyan-600/80 mt-2 break-all bg-black/50 p-2 rounded border border-cyan-900/30">
                              {JSON.stringify(call.args, null, 2)}
                            </div>
                            {call.result && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="mt-2 text-[10px] font-mono text-green-400/80 bg-black/50 p-2 rounded border border-green-900/30 max-h-32 overflow-y-auto break-all whitespace-pre-wrap"
                              >
                                <div className="flex items-center gap-2 mb-1 border-b border-green-900/30 pb-1">
                                  <Check className="w-3 h-3 text-green-500" />
                                  <span className="text-green-500 font-bold uppercase tracking-widest">
                                    Operation Successful
                                  </span>
                                </div>
                                {typeof call.result === 'string'
                                  ? call.result
                                  : JSON.stringify(call.result, null, 2)}
                              </motion.div>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'Apply' && (
              <motion.div
                key="Apply"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="flex flex-col h-full space-y-6 overflow-hidden"
              >
                <div className="flex-1 flex flex-col bg-black/40 backdrop-blur-md border border-cyan-900/30 rounded-2xl overflow-hidden shadow-2xl">
                  <div className="bg-cyan-950/50 px-4 py-3 border-b border-cyan-900/50 flex flex-col sm:flex-row justify-between items-center gap-3">
                    <div className="flex items-center justify-center gap-3 w-full sm:w-auto text-center">
                      <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.8)]"></div>
                      <span className="text-[10px] font-mono text-cyan-300 uppercase tracking-widest truncate">
                        {selectedFile || 'Select a sector to modify'}
                      </span>
                      {lastSaved && (
                        <span className="text-[9px] font-mono text-cyan-700 hidden sm:inline whitespace-nowrap">
                          Last Sync: {lastSaved.toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-center gap-4 w-full sm:w-auto flex-wrap">
                      <div className="flex items-center gap-2 px-3 py-1 bg-black/50 border border-cyan-900/30 rounded-full">
                        <GitCommitVertical className="w-3 h-3 text-indigo-400" />
                        <span className="text-[9px] font-mono text-indigo-400 uppercase tracking-widest">
                          {gitInfo.branch}
                        </span>
                      </div>
                      <button
                        onClick={handleAIRefactor}
                        disabled={isRefactoring || !selectedFile}
                        className={`p-1.5 transition-colors ${isRefactoring ? 'text-gray-600' : 'text-purple-400 hover:text-purple-300'}`}
                        title="AI Refactor"
                      >
                        <Sparkles
                          className={`w-4 h-4 ${isRefactoring ? 'animate-spin' : ''}`}
                        />
                      </button>
                      <button
                        onClick={() =>
                          setGeneratePrompt({ isOpen: true, text: '' })
                        }
                        className="p-1.5 text-emerald-400 hover:text-emerald-300 transition-colors"
                        title="AI Generate"
                      >
                        <Wand2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleFormat}
                        disabled={!selectedFile}
                        className="p-1.5 text-indigo-400 hover:text-indigo-300 transition-colors"
                        title="Format Code"
                      >
                        <AlignLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (selectedFile) {
                            wsRef.current?.send(
                              JSON.stringify({
                                type: 'execute_tool',
                                callId: 'manual-save-' + Date.now(),
                                name: 'editFile',
                                args: {
                                  path: selectedFile,
                                  content: files[selectedFile],
                                },
                              }),
                            );
                            setLastSaved(new Date());
                          }
                        }}
                        className="p-1.5 text-cyan-500 hover:text-cyan-300 transition-colors"
                        title="Sync Manual"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto relative custom-editor">
                    {selectedFile ? (
                      <div className="flex min-h-full">
                        <div className="w-10 bg-black/20 border-r border-cyan-900/20 py-5 flex flex-col items-center text-[10px] font-mono text-cyan-900 select-none">
                          {(files[selectedFile] || '')
                            .split('\n')
                            .map((_, i) => (
                              <div
                                key={i}
                                className="h-[1.5rem] leading-[1.5rem]"
                              >
                                {i + 1}
                              </div>
                            ))}
                        </div>
                        <div className="flex-1">
                          <Editor
                            value={files[selectedFile] || ''}
                            onValueChange={(code) =>
                              setFiles((prev) => ({
                                ...prev,
                                [selectedFile]: code,
                              }))
                            }
                            highlight={(code) =>
                              Prism.highlight(
                                code,
                                Prism.languages.typescript,
                                'typescript',
                              )
                            }
                            padding={20}
                            style={{
                              fontFamily: '"Fira code", "Fira Mono", monospace',
                              fontSize: 12,
                              minHeight: '100%',
                              backgroundColor: 'transparent',
                              lineHeight: '1.5rem',
                            }}
                            className="focus:outline-none text-cyan-100"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-10 space-y-4">
                        <div className="w-16 h-16 rounded-full bg-cyan-950/50 border border-cyan-900/30 flex items-center justify-center">
                          <FileCode2 className="w-8 h-8 text-cyan-900" />
                        </div>
                        <div>
                          <h3 className="text-sm font-mono text-cyan-700 uppercase tracking-widest">
                            No Sector Selected
                          </h3>
                          <p className="text-[10px] font-mono text-cyan-900 mt-1">
                            Select a file from the neural link to begin
                            synthesis
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-4 shrink-0">
                  <button
                    onClick={() => {
                      if (wsRef.current?.readyState === WebSocket.OPEN) {
                        Object.keys(files).forEach((path) => {
                          wsRef.current?.send(
                            JSON.stringify({
                              type: 'revert_file',
                              payload: { path },
                            }),
                          );
                        });
                        setStatusAndBroadcast('REVERTED CHANGES');
                      }
                    }}
                    className="flex-1 px-5 py-3 bg-black/50 hover:bg-black border border-cyan-900/50 text-cyan-300 rounded-xl text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                  >
                    <Undo className="w-4 h-4" /> Revert
                  </button>
                  <button
                    onClick={() => setActiveTabAndBroadcast('Preview')}
                    className="flex-1 px-5 py-3 bg-cyan-500 hover:bg-cyan-400 text-black rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)]"
                  >
                    <Play className="w-4 h-4" /> Initialize
                  </button>
                </div>
              </motion.div>
            )}

            {activeTab === 'Preview' && (
              <motion.div
                key="Preview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="h-full flex flex-col"
              >
                <div className="bg-black/80 backdrop-blur-xl border border-cyan-900/50 rounded-t-2xl p-3 flex items-center justify-between z-10">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500/50 border border-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500/50 border border-yellow-500 shadow-[0_0_5px_rgba(234,179,8,0.5)]"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500/50 border border-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></div>
                  </div>
                  <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest flex items-center gap-2 bg-cyan-950/50 px-3 py-1 rounded-full border border-cyan-900/50">
                    <RefreshCw
                      className="w-3 h-3 cursor-pointer hover:text-white transition-colors"
                      onClick={() => {
                        const iframe = document.getElementById(
                          'preview-iframe',
                        ) as HTMLIFrameElement;
                        if (iframe) iframe.src = iframe.src;
                      }}
                    />{' '}
                    Holo-Deck
                  </div>
                </div>
                <div className="flex-1 bg-white rounded-b-2xl overflow-hidden relative flex items-center justify-center border-x border-b border-cyan-900/50 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                  <iframe
                    id="preview-iframe"
                    src="/preview"
                    className="w-full h-full border-0"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="absolute bottom-4 left-4 right-4 bg-black/60 backdrop-blur-xl border border-cyan-500/20 rounded-2xl p-2 z-20 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
        <div className="flex justify-around items-center">
          <NavItem
            icon={<Mic className="w-5 h-5" />}
            label="COMMS"
            isActive={activeTab === 'Talk'}
            onClick={() => setActiveTabAndBroadcast('Talk')}
          />
          <NavItem
            icon={<FileCode2 className="w-5 h-5" />}
            label="DATA"
            isActive={activeTab === 'Review'}
            onClick={() => setActiveTabAndBroadcast('Review')}
          />
          <NavItem
            icon={<Check className="w-5 h-5" />}
            label="SYNC"
            isActive={activeTab === 'Apply'}
            onClick={() => setActiveTabAndBroadcast('Apply')}
          />
          <NavItem
            icon={<Play className="w-5 h-5" />}
            label="RUN"
            isActive={activeTab === 'Preview'}
            onClick={() => setActiveTabAndBroadcast('Preview')}
          />
        </div>
      </nav>

      {/* Generate Prompt Modal */}
      <AnimatePresence>
        {generatePrompt.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-cyan-950/90 border border-emerald-500/50 rounded-2xl p-6 shadow-[0_0_30px_rgba(16,185,129,0.2)]"
            >
              <h3 className="text-emerald-400 font-mono text-sm uppercase tracking-widest mb-4 flex items-center gap-2">
                <Wand2 className="w-4 h-4" /> Generate Code
              </h3>
              <textarea
                value={generatePrompt.text}
                onChange={(e) =>
                  setGeneratePrompt((prev) => ({
                    ...prev,
                    text: e.target.value,
                  }))
                }
                placeholder="Describe the code you want to generate..."
                className="w-full h-32 bg-black/50 border border-emerald-500/30 rounded-lg p-3 text-emerald-100 font-mono text-xs outline-none focus:border-emerald-400 resize-none mb-4"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setGeneratePrompt({ isOpen: false, text: '' })}
                  className="flex-1 py-2 text-[10px] font-mono text-gray-400 hover:text-gray-200 uppercase tracking-widest transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={!generatePrompt.text.trim()}
                  onClick={() => {
                    handleAIGenerate(generatePrompt.text);
                    setGeneratePrompt({ isOpen: false, text: '' });
                  }}
                  className="flex-1 bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-50 disabled:hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg py-2 text-[10px] font-mono text-emerald-300 uppercase tracking-widest transition-all"
                >
                  Generate
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Refactor Confirm Modal */}
      <AnimatePresence>
        {refactorConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-cyan-950/90 border border-purple-500/50 rounded-2xl p-6 shadow-[0_0_30px_rgba(168,85,247,0.2)]"
            >
              <h3 className="text-purple-400 font-mono text-sm uppercase tracking-widest mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> AI Refactor Complete
              </h3>
              <p className="text-purple-200/70 text-xs font-mono mb-6">
                AI has generated a refactored version of{' '}
                <span className="text-purple-300">{refactorConfirm.file}</span>.
                Apply changes?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setStatusAndBroadcast('AI REFACTOR DISCARDED');
                    setRefactorConfirm(null);
                  }}
                  className="flex-1 py-2 text-[10px] font-mono text-gray-400 hover:text-gray-200 uppercase tracking-widest transition-colors"
                >
                  Discard
                </button>
                <button
                  onClick={() => {
                    setFiles((prev) => ({
                      ...prev,
                      [refactorConfirm.file]: refactorConfirm.code,
                    }));
                    setStatusAndBroadcast('AI REFACTOR APPLIED');
                    setRefactorConfirm(null);
                  }}
                  className="flex-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-lg py-2 text-[10px] font-mono text-purple-300 uppercase tracking-widest transition-all"
                >
                  Apply Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FileTree({
  files,
  onSelect,
  selectedFile,
  searchQuery,
}: {
  files: Record<string, string>;
  onSelect: (path: string) => void;
  selectedFile: string | null;
  searchQuery: string;
}) {
  const filteredFiles = Object.keys(files).filter((path) =>
    path.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-1">
      {filteredFiles.length === 0 ? (
        <div className="px-3 py-4 text-[9px] font-mono text-cyan-900 italic">
          No sectors found
        </div>
      ) : (
        filteredFiles.map((path) => (
          <button
            key={path}
            onClick={() => onSelect(path)}
            className={`w-full text-left px-3 py-2 text-[10px] font-mono truncate transition-all flex items-center gap-2 rounded-lg ${selectedFile === path ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30' : 'text-cyan-600 hover:bg-cyan-950/20 hover:text-cyan-400'}`}
          >
            <FileCode2 className="w-3 h-3 min-w-[12px]" />
            <span className="truncate">{path}</span>
          </button>
        ))
      )}
    </div>
  );
}

function NavItem({
  icon,
  label,
  isActive,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-300 ${isActive ? 'bg-cyan-950/50 text-cyan-300 shadow-[inset_0_0_10px_rgba(6,182,212,0.2)]' : 'text-cyan-800 hover:text-cyan-500 hover:bg-white/5'}`}
    >
      <div
        className={`mb-1 ${isActive ? 'scale-110 drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]' : ''}`}
      >
        {icon}
      </div>
      <span className="text-[9px] font-mono tracking-widest">{label}</span>
    </button>
  );
}
