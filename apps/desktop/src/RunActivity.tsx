import { useMemo } from 'react';
import type { Session, SessionEvent } from '@cc-desk-tunnel/protocol';
import { duration } from './activity.ts';

// Transport status and telemetry are not evidence of task progress.
export default function RunActivity({
  session,
  events,
  connected,
  ownsRun,
  now,
}: {
  session: Session;
  events: SessionEvent[];
  connected: boolean;
  ownsRun: boolean;
  now: number;
}) {
  const run = session.activeRun!;
  const activity = useMemo(() => {
    let at: string | undefined;
    let fallback: string | undefined;
    let operation = '';
    let membership = '';
    let tasks: { id: string; description: string; kind: string }[] = [];
    for (const event of events) {
      if (event.runId !== run.id) continue;
      fallback ??= event.createdAt;
      const p = event.payload;
      if (p.type === 'native.tasks') {
        tasks = p.tasks;
        const next = JSON.stringify(p.tasks.map((t) => t.id).sort());
        if (membership !== next) at = event.createdAt;
        membership = next;
        for (const task of p.tasks) {
          if (task.progress && (!at || Date.parse(task.progress.updatedAt) > Date.parse(at)))
            at = task.progress.updatedAt;
        }
      } else if (
        [
          'text.delta',
          'thinking.delta',
          'tool.requested',
          'tool.input.delta',
          'tool.output',
          'tool.result',
          'native.notice',
          'error',
        ].includes(p.type)
      ) {
        at = event.createdAt;
        if (p.type === 'tool.requested') operation = p.name;
      }
    }
    return { at, fallback, operation, tasks };
  }, [events, run.id]);
  const age = activity.at ? Math.max(0, now - Date.parse(activity.at)) : null;
  const quiet = age !== null && age >= 60000;
  const approval = run.status === 'awaiting_approval';
  const state = !connected ? 'offline' : approval ? 'approval' : quiet ? 'quiet' : 'waiting';
  const title = !connected
    ? '连接中断 · 运行状态待确认'
    : approval
      ? run.waiting === 'question'
        ? '等待你的回答'
        : '等待你的审批'
      : quiet
        ? '会话未结束 · 暂无新活动'
        : '会话进行中';
  return (
    <div className="run-activity" data-state={state}>
      <div className="run-activity-heading" role="status">
        <span className="task-wait-mark" aria-hidden="true" />
        <span>{title}</span>
        {!ownsRun && <small>另一连接</small>}
      </div>
      <div className="run-activity-meta">
        {activity.at ? (
          <>
            最近活动{' '}
            <time dateTime={activity.at}>{new Date(activity.at).toLocaleTimeString()}</time>
            {' · '}
            {quiet
              ? `${duration(activity.at, now)}无新活动`
              : `${Math.floor((age ?? 0) / 1000)} 秒前`}
          </>
        ) : activity.fallback ? (
          `尚未收到活动 · 已等待 ${duration(activity.fallback, now)}`
        ) : (
          '尚未收到活动记录'
        )}
      </div>
      {activity.tasks.length > 0 ? (
        <ul className="run-activity-tasks">
          {activity.tasks.map((task) => (
            <li key={task.id}>子任务尚未结束 · {task.description || task.kind}</li>
          ))}
        </ul>
      ) : activity.operation ? (
        <div className="run-activity-operation">最近操作 · {activity.operation}</div>
      ) : null}
      {(!connected || quiet) && (
        <p className="run-activity-note">
          {!connected
            ? '恢复连接后确认任务结果。'
            : '可能在等待模型或子任务；没有新活动不能确认任务是否正在推进。'}
        </p>
      )}
    </div>
  );
}
