/* ============================================================================
   The main-thread side of the engine (brief §7).

   Exactly one worker for the whole app, created on first use and reused for
   hints — a second one is never spawned. The worker is loaded lazily so the
   board reaches interactive without the search code in the bundle at all.
   ========================================================================= */

import type { Request, Response } from './messages';
import type { PositionState, Square, Variant } from '../engine/types';
import type { Level } from '../data/types';

/** Below this, the answer is held back so the exchange has a rhythm. The delay
    is never padded beyond it: a search that takes longer is simply awaited. */
const MINIMUM_BEAT_MS = 300;

export interface Thought {
  square: Square;
  score: number;
  depth: number;
  nodes: number;
  exact: boolean;
  fromBook: boolean;
}

export class EngineClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: never) => void; reject: (error: Error) => void }>();

  /** Varies the book choice between games without making a move unreproducible. */
  private seed = 1;

  private ensure(): Worker {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<Response>) => this.receive(event.data);
    this.worker.onerror = () => {
      for (const { reject } of this.pending.values()) reject(new Error('The engine stopped'));
      this.pending.clear();
    };
    return this.worker;
  }

  private receive(message: Response): void {
    if (message.type === 'ready') return;
    const entry = this.pending.get(message.id);
    if (!entry) return;
    this.pending.delete(message.id);
    if (message.type === 'error') { entry.reject(new Error(message.message)); return; }
    if (message.type === 'aborted') { entry.reject(new Error('aborted')); return; }
    (entry.resolve as (value: unknown) => void)(message);
  }

  private send<T>(request: Request & { id: number }): Promise<T> {
    const worker = this.ensure();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(request.id, {
        resolve: resolve as (value: never) => void,
        reject,
      });
      worker.postMessage(request);
    });
  }

  async think(
    position: PositionState,
    level: Level,
    variant: Variant,
    transcript: string,
  ): Promise<Square> {
    this.seed = (this.seed * 1_103_515_245 + 12_345) >>> 0;
    const started = Date.now();
    const id = this.nextId++;
    const answer = await this.send<Extract<Response, { type: 'move' }>>({
      type: 'think', id, position, level, variant, transcript, seed: this.seed,
    });
    const elapsed = Date.now() - started;
    if (elapsed < MINIMUM_BEAT_MS) await pause(MINIMUM_BEAT_MS - elapsed);
    return answer.square;
  }

  async hint(position: PositionState, variant: Variant): Promise<{ square: Square; reason: string }> {
    const id = this.nextId++;
    const answer = await this.send<Extract<Response, { type: 'hint' }>>({
      type: 'hint', id, position, variant,
    });
    return { square: answer.square, reason: answer.reason };
  }

  /** Abandon whatever is running. The worker sees this between depths. */
  stop(): void {
    this.worker?.postMessage({ type: 'stop' } satisfies Request);
  }

  dispose(): void {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
    for (const { reject } of this.pending.values()) reject(new Error('aborted'));
    this.pending.clear();
  }
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });
