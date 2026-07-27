import type { Pool } from "pg";
import type { GeminiContent } from "./geminiTypes.ts";

export type StoredMessageRole = "user" | "model" | "tool";

export interface SessionStore {
  createSession(customerPhone?: string): Promise<string>;
  appendMessage(
    sessionId: string,
    role: StoredMessageRole,
    content: GeminiContent
  ): Promise<void>;
  getHistory(sessionId: string): Promise<GeminiContent[]>;
}

export class PostgresSessionStore implements SessionStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async createSession(customerPhone?: string): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO chat_sessions (customer_phone)
       VALUES ($1)
       RETURNING id`,
      [customerPhone ?? null]
    );
    return result.rows[0]!.id;
  }

  async appendMessage(
    sessionId: string,
    role: StoredMessageRole,
    content: GeminiContent
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO chat_messages (session_id, role, content)
       VALUES ($1, $2, $3::jsonb)`,
      [sessionId, role, JSON.stringify(content)]
    );
    await this.pool.query(
      `UPDATE chat_sessions SET updated_at = now() WHERE id = $1`,
      [sessionId]
    );
  }

  async getHistory(sessionId: string): Promise<GeminiContent[]> {
    const result = await this.pool.query<{ content: GeminiContent }>(
      `SELECT content
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY id`,
      [sessionId]
    );
    return result.rows.map((row) => row.content);
  }
}

export class MemorySessionStore implements SessionStore {
  private nextId = 1;
  private readonly messages = new Map<string, GeminiContent[]>();

  async createSession(): Promise<string> {
    const id = `session_${String(this.nextId).padStart(4, "0")}`;
    this.nextId += 1;
    this.messages.set(id, []);
    return id;
  }

  async appendMessage(
    sessionId: string,
    _role: StoredMessageRole,
    content: GeminiContent
  ): Promise<void> {
    const messages = this.messages.get(sessionId);
    if (!messages) throw new Error(`No chat session matches id: ${sessionId}`);
    messages.push(structuredClone(content));
  }

  async getHistory(sessionId: string): Promise<GeminiContent[]> {
    const messages = this.messages.get(sessionId);
    if (!messages) throw new Error(`No chat session matches id: ${sessionId}`);
    return structuredClone(messages);
  }
}
