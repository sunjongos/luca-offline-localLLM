import * as http from 'http';
import * as https from 'https';
import * as url from 'url';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export interface OllamaStreamChunk {
  model: string;
  message: { role: string; content: string };
  done: boolean;
}

export class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  setBaseUrl(newUrl: string): void {
    this.baseUrl = newUrl.replace(/\/$/, '');
  }

  /**
   * Check if Ollama server is reachable
   */
  async isAlive(): Promise<boolean> {
    return new Promise((resolve) => {
      const parsed = new url.URL(this.baseUrl);
      const options: http.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port || 11434,
        path: '/api/tags',
        method: 'GET',
        timeout: 3000,
      };

      const req = http.request(options, (res) => {
        resolve(res.statusCode === 200);
        res.resume();
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
  }

  /**
   * List available models
   */
  async listModels(): Promise<OllamaModel[]> {
    return new Promise((resolve, reject) => {
      const parsed = new url.URL(this.baseUrl);
      const options: http.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port || 11434,
        path: '/api/tags',
        method: 'GET',
        timeout: 5000,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.models || []);
          } catch (e) {
            reject(new Error('Failed to parse model list'));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Connection timeout'));
      });
      req.end();
    });
  }

  /**
   * Stream a chat completion from Ollama
   */
  async chatStream(
    model: string,
    messages: OllamaMessage[],
    onToken: (token: string) => void,
    onDone: () => void,
    onError: (error: Error) => void,
    abortSignal?: { aborted: boolean }
  ): Promise<void> {
    const body = JSON.stringify({
      model,
      messages,
      stream: true,
    });

    const parsed = new url.URL(this.baseUrl);
    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || 11434,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 120000,
    };

    const req = http.request(options, (res) => {
      let buffer = '';

      res.on('data', (chunk: Buffer) => {
        if (abortSignal?.aborted) {
          req.destroy();
          return;
        }

        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) {continue;}
          try {
            const parsed: OllamaStreamChunk = JSON.parse(line);
            if (parsed.message?.content) {
              onToken(parsed.message.content);
            }
            if (parsed.done) {
              onDone();
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      });

      res.on('end', () => {
        // Process any remaining buffer
        if (buffer.trim()) {
          try {
            const parsed: OllamaStreamChunk = JSON.parse(buffer);
            if (parsed.message?.content) {
              onToken(parsed.message.content);
            }
            if (parsed.done) {
              onDone();
            }
          } catch {
            // Ignore
          }
        }
      });

      res.on('error', (err) => onError(err));
    });

    req.on('error', (err) => onError(err));
    req.on('timeout', () => {
      req.destroy();
      onError(new Error('Ollama 서버 응답 타임아웃 (120초 초과)'));
    });

    req.write(body);
    req.end();
  }

  /**
   * Non-streaming chat (for simple queries)
   */
  async chat(model: string, messages: OllamaMessage[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model,
        messages,
        stream: false,
      });

      const parsed = new url.URL(this.baseUrl);
      const options: http.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port || 11434,
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 120000,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve(result.message?.content || '');
          } catch {
            reject(new Error('Failed to parse Ollama response'));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Connection timeout'));
      });

      req.write(body);
      req.end();
    });
  }
}
