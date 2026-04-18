/**
 * In-memory session pool.
 *
 * Maintains a Map of sessionId → Agent, lazily creating agents on demand via
 * an AgentFactory. Supports clearing individual sessions (with optional
 * persisted-data deletion) and clearing all sessions at once.
 */

import type { Agent } from "@strands-agents/sdk";
import type { SessionConfig, AgentFactory } from "./types.js";
import { resolveStorage, createAgentFactory } from "./agent-factory.js";

export class SessionStore {
  private readonly _sessions = new Map<string, Agent>();
  private _agentFactory: AgentFactory | undefined;
  private readonly _config: SessionConfig;
  private readonly _agentFactoryOverride?: AgentFactory;
  private _initPromise: Promise<void> | undefined;

  constructor(config: SessionConfig, agentFactory?: AgentFactory) {
    this._config = config;
    this._agentFactoryOverride = agentFactory;
  }

  private _init(): Promise<void> {
    if (!this._initPromise) {
      this._initPromise = resolveStorage(this._config).then((snapshotStorage) => {
        this._agentFactory =
          this._agentFactoryOverride ?? createAgentFactory(this._config, snapshotStorage);
      });
    }
    return this._initPromise;
  }

  async getOrCreate(sessionId: string): Promise<Agent> {
    await this._init();
    if (!this._sessions.has(sessionId)) {
      this._sessions.set(sessionId, await this._agentFactory!(sessionId));
    }
    return this._sessions.get(sessionId)!;
  }

  async clear(sessionId: string, opts?: { deletePersistedData?: boolean }): Promise<void> {
    const agent = this._sessions.get(sessionId);
    if (agent && opts?.deletePersistedData) {
      await agent.sessionManager?.deleteSession();
    }
    this._sessions.delete(sessionId);
  }

  async clearAll(opts?: { deletePersistedData?: boolean }): Promise<void> {
    for (const sessionId of this._sessions.keys()) {
      await this.clear(sessionId, opts);
    }
  }

  size(): number {
    return this._sessions.size;
  }
}
