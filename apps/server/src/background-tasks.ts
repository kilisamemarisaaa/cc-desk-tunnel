import type { EventPayload } from '@cc-desk-tunnel/protocol';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

type Task = Extract<EventPayload, { type: 'native.tasks' }>['tasks'][number];
type Progress = NonNullable<Task['progress']>;

// Membership is authoritative; progress never creates a task or changes the run's lifecycle.
export class BackgroundTasks {
  private tasks: Task[] = [];
  private progress = new Map<string, Progress>();
  private published = new Map<string, Progress>();
  private emit: (event: EventPayload) => void;
  constructor(emit: (event: EventPayload) => void) {
    this.emit = emit;
  }
  accept(message: SDKMessage) {
    if (message.type === 'system' && message.subtype === 'background_tasks_changed') {
      const previous = new Set(this.tasks.map((task) => task.id));
      this.tasks = message.tasks
        .filter((task) => !task.ambient)
        .map((task) => ({
          id: task.task_id,
          kind: task.task_type,
          description: task.description,
        }));
      for (const id of previous) {
        if (!this.tasks.some((task) => task.id === id)) {
          this.progress.delete(id);
          this.published.delete(id);
        }
      }
      this.publish();
      return;
    }
    let id: string | undefined;
    let summary: string | undefined;
    let elapsedSeconds: number | undefined;
    if (message.type === 'system' && message.subtype === 'task_progress') {
      id = message.task_id;
      summary = message.summary?.trim().slice(0, 1000) || undefined;
      elapsedSeconds = message.usage.duration_ms / 1000;
    } else if (message.type === 'tool_progress' && message.task_id) {
      id = message.task_id;
      elapsedSeconds = message.elapsed_time_seconds;
    } else return;
    if (!id || !Number.isFinite(elapsedSeconds) || elapsedSeconds! < 0) return;
    const previous = this.progress.get(id);
    const next: Progress = {
      summary: summary ?? previous?.summary,
      elapsedSeconds: Math.max(previous?.elapsedSeconds ?? 0, elapsedSeconds!),
      updatedAt: new Date().toISOString(),
    };
    this.progress.set(id, next);
    // Progress may precede membership, or describe a foreground task. Bound that cache.
    while (this.progress.size > 128) this.progress.delete(this.progress.keys().next().value!);
    if (!this.tasks.some((task) => task.id === id)) return;
    const shown = this.published.get(id);
    if (
      shown &&
      next.summary === shown.summary &&
      Date.parse(next.updatedAt) - Date.parse(shown.updatedAt) < 5000
    )
      return;
    this.publish();
  }
  private publish() {
    const tasks = this.tasks.map((task) => {
      const progress = this.progress.get(task.id);
      if (progress) this.published.set(task.id, progress);
      return progress ? { ...task, progress } : task;
    });
    this.emit({ type: 'native.tasks', tasks });
  }
}
