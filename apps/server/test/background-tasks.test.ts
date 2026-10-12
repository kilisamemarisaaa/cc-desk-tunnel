import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { eventPayloadSchema } from '@cc-desk-tunnel/protocol';
import type { EventPayload } from '@cc-desk-tunnel/protocol';
import { BackgroundTasks } from '../src/background-tasks.ts';

const meta = { uuid: randomUUID(), session_id: randomUUID() };
const task = { task_id: 'b1', task_type: 'local_bash', description: 'WebKit tests' };
function fixture() {
  const events: Extract<EventPayload, { type: 'native.tasks' }>[] = [];
  const tracker = new BackgroundTasks((event) => {
    const parsed = eventPayloadSchema.parse(event);
    if (parsed.type === 'native.tasks') events.push(parsed);
  });
  const membership = (tasks = [task]) =>
    tracker.accept({
      ...meta,
      type: 'system',
      subtype: 'background_tasks_changed',
      tasks,
    });
  const progress = (summary = '[19/41] WebKit home', duration = 1000) =>
    tracker.accept({
      ...meta,
      type: 'system',
      subtype: 'task_progress',
      task_id: 'b1',
      description: task.description,
      summary,
      usage: { total_tokens: 0, tool_uses: 0, duration_ms: duration },
    });
  return { events, tracker, membership, progress };
}
test('progress before membership is retained, but never invents a running task', () => {
  const { events, membership, progress } = fixture();
  progress();
  assert.equal(events.length, 0);
  membership();
  assert.equal(events[0].tasks[0].progress?.summary, '[19/41] WebKit home');
  assert.equal(events[0].tasks[0].progress?.elapsedSeconds, 1);
  progress('[20/41] next test', 2000);
  assert.equal(events.at(-1)?.tasks[0].progress?.summary, '[20/41] next test');
  membership();
  assert.equal(events.at(-1)?.tasks[0].progress?.summary, '[20/41] next test');
  membership([]);
  progress('late progress', 3000);
  assert.deepEqual(events.at(-1)?.tasks, []);
});
test('heartbeat updates retain summaries, are rate limited, and never rewind elapsed time', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const { events, tracker, membership, progress } = fixture();
  membership();
  progress();
  const count = events.length;
  const heartbeat: SDKMessage = {
    ...meta,
    type: 'tool_progress',
    task_id: 'b1',
    tool_use_id: 'tool-1',
    tool_name: 'Bash',
    parent_tool_use_id: null,
    elapsed_time_seconds: 0.5,
  };
  tracker.accept(heartbeat);
  assert.equal(events.length, count);
  t.mock.timers.tick(5000);
  tracker.accept(heartbeat);
  assert.equal(events.length, count + 1);
  assert.equal(events.at(-1)?.tasks[0].progress?.elapsedSeconds, 1);
  assert.equal(events.at(-1)?.tasks[0].progress?.summary, '[19/41] WebKit home');
});
test('ambient tasks stay hidden and summaries are bounded plain text', () => {
  const { events, tracker, progress } = fixture();
  tracker.accept({
    ...meta,
    type: 'system',
    subtype: 'background_tasks_changed',
    tasks: [{ ...task, ambient: true }],
  });
  progress('<script>bad()</script>'.repeat(100));
  assert.deepEqual(events.at(-1)?.tasks, []);
  tracker.accept({ ...meta, type: 'system', subtype: 'background_tasks_changed', tasks: [task] });
  assert.equal(events.at(-1)?.tasks[0].progress?.summary?.length, 1000);
});
