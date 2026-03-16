import express from 'express';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';
import dotenv from 'dotenv';
import AdmZip from 'adm-zip';

const execAsync = util.promisify(exec);

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = 3000;

app.use(express.json());

const backups: Record<string, string> = {};

let appState = {
  transcript: '',
  status: 'SYSTEM STANDBY',
  agentResponses: [] as string[],
  toolCalls: [] as any[],
  activeTab: 'Talk',
  isRecording: false,
  files: {} as Record<string, string>
};

// Initialize files
const initialFiles = ['src/generated/App.tsx', 'src/App.tsx', 'server.ts', 'package.json'];
initialFiles.forEach(file => {
  try {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      appState.files[file] = fs.readFileSync(fullPath, 'utf-8');
    }
  } catch (e) {
    console.error(`Error reading initial file ${file}`, e);
  }
});

wss.on('connection', (ws) => {
  console.log('Client connected');

  // Send current state to new client
  ws.send(JSON.stringify({ type: 'files', payload: appState.files }));
  ws.send(JSON.stringify({ type: 'sync_state', payload: { type: 'transcript', payload: appState.transcript } }));
  ws.send(JSON.stringify({ type: 'sync_state', payload: { type: 'status', payload: appState.status } }));
  ws.send(JSON.stringify({ type: 'sync_state', payload: { type: 'activeTab', payload: appState.activeTab } }));
  ws.send(JSON.stringify({ type: 'sync_state', payload: { type: 'isRecording', payload: appState.isRecording } }));
  appState.agentResponses.forEach(res => {
    ws.send(JSON.stringify({ type: 'sync_state', payload: { type: 'agent_response', payload: res } }));
  });
  appState.toolCalls.forEach(call => {
    ws.send(JSON.stringify({ type: 'sync_state', payload: { type: 'tool_call', payload: call } }));
    if (call.result) {
      ws.send(JSON.stringify({ type: 'sync_state', payload: { type: 'tool_call_result', payload: call } }));
    }
  });

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'revert_file') {
        const { path: filePath } = data.payload;
        if (backups[filePath]) {
          const fullPath = path.join(process.cwd(), filePath);
          fs.writeFileSync(fullPath, backups[filePath], 'utf-8');
          appState.files[filePath] = backups[filePath];
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'file_updated', payload: { path: filePath, content: backups[filePath] } }));
            }
          });
        }
      } else if (data.type === 'broadcast') {
        if (data.payload.type === 'sync_state') {
          const syncType = data.payload.payload.type;
          const syncPayload = data.payload.payload.payload;
          
          if (syncType === 'transcript') appState.transcript = syncPayload;
          else if (syncType === 'status') appState.status = syncPayload;
          else if (syncType === 'activeTab') appState.activeTab = syncPayload;
          else if (syncType === 'isRecording') appState.isRecording = syncPayload;
          else if (syncType === 'agent_response') appState.agentResponses.push(syncPayload);
          else if (syncType === 'agent_response_update') {
            if (appState.agentResponses.length > 0) {
              appState.agentResponses[appState.agentResponses.length - 1] = syncPayload;
            } else {
              appState.agentResponses.push(syncPayload);
            }
          }
          else if (syncType === 'agent_response_clear') appState.agentResponses = [];
          else if (syncType === 'tool_call') appState.toolCalls.push(syncPayload);
          else if (syncType === 'tool_call_clear') appState.toolCalls = [];
          else if (syncType === 'tool_call_result') {
            const callIndex = appState.toolCalls.findIndex(c => c.name === syncPayload.name && JSON.stringify(c.args) === JSON.stringify(syncPayload.args));
            if (callIndex !== -1) {
              appState.toolCalls[callIndex].result = syncPayload.result;
            }
          }
        }
        
        wss.clients.forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data.payload));
          }
        });
      } else if (data.type === 'execute_tool') {
        const { callId, name, args } = data;
        let result: any = {};
        
        try {
          if (name === 'readFile') {
            const filePath = path.join(process.cwd(), args.path as string);
            const content = fs.readFileSync(filePath, 'utf-8');
            appState.files[args.path] = content;
            result = { content };
            // Broadcast file update to all clients
            wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'file_updated', payload: { path: args.path, content } }));
              }
            });
          } else if (name === 'editFile') {
            const filePath = path.join(process.cwd(), args.path as string);
            const content = args.content as string;
            
            if (fs.existsSync(filePath)) {
              backups[args.path] = fs.readFileSync(filePath, 'utf-8');
            }
            
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, content, 'utf-8');
            appState.files[args.path] = content;
            result = { status: 'File updated successfully' };
            // Broadcast file update to all clients
            wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'file_updated', payload: { path: args.path, content } }));
              }
            });
          } else if (name === 'runShell') {
            const cmd = args.command as string;
            const { stdout, stderr } = await execAsync(cmd, { cwd: process.cwd() });
            result = { output: stdout, error: stderr };
          } else if (name === 'gitStatus') {
            const { stdout, stderr } = await execAsync('git status', { cwd: process.cwd() });
            result = { output: stdout, error: stderr };
          } else if (name === 'gitAdd') {
            const files = args.files as string[] || ['.'];
            const { stdout, stderr } = await execAsync(`git add ${files.join(' ')}`, { cwd: process.cwd() });
            result = { output: stdout, error: stderr };
          } else if (name === 'gitCommit') {
            const message = args.message as string;
            const { stdout, stderr } = await execAsync(`git commit -m "${message}"`, { cwd: process.cwd() });
            result = { output: stdout, error: stderr };
          } else if (name === 'gitPull') {
            const { stdout, stderr } = await execAsync('git pull', { cwd: process.cwd() });
            result = { output: stdout, error: stderr };
          } else if (name === 'gitPush') {
            const { stdout, stderr } = await execAsync('git push', { cwd: process.cwd() });
            result = { output: stdout, error: stderr };
          } else {
            result = { error: `Unknown tool: ${name}` };
          }
        } catch (e: any) {
          result = { error: e.message, stdout: e.stdout, stderr: e.stderr };
        }
        
        ws.send(JSON.stringify({ type: 'tool_result', callId, result }));
      }
    } catch (e) {
      console.error('Error handling message:', e);
    }
  });
});

async function startServer() {
  // API routes
  app.get('/api/files', (req, res) => {
    res.json({});
  });

  app.get('/api/export-zip', (req, res) => {
    try {
      const zip = new AdmZip();
      const ignoreDirs = ['node_modules', '.next', 'dist', '.git'];
      
      const addFilesToZip = (dir: string, zipPath: string = '') => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (ignoreDirs.includes(file)) continue;
          const fullPath = path.join(dir, file);
          const stats = fs.statSync(fullPath);
          if (stats.isDirectory()) {
            addFilesToZip(fullPath, path.join(zipPath, file));
          } else {
            zip.addLocalFile(fullPath, zipPath);
          }
        }
      };

      addFilesToZip(process.cwd());
      const buffer = zip.toBuffer();
      
      res.set('Content-Type', 'application/zip');
      res.set('Content-Disposition', 'attachment; filename=project-export.zip');
      res.send(buffer);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
