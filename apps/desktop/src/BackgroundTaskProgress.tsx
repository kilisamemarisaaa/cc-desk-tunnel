import { useEffect, useState } from 'react';
import type { EventPayload } from '@cc-desk-tunnel/protocol';
import { duration } from './activity.ts';

type Task = Extract<EventPayload, { type: 'native.tasks' }>['tasks'][number];

export default function BackgroundTaskProgress({
  task,
  connected,
  firstSeen,
}: {
  task: Task;
  connected: boolean;
  firstSeen?: string;
}) {
  const [now, setNow] = useState(Date.now);
  const progress = task.progress;
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [connected, progress?.updatedAt, firstSeen]);
  const age = progress ? Math.max(0, now - Date.parse(progress.updatedAt)) : 0;
  const state = !connected ? 'offline' : progress && age >= 60000 ? 'quiet' : 'waiting';
  return (
    <div className="background-task-detail" data-state={state}>
      <div className="background-task-heading">
        <span className="task-wait-mark" aria-hidden="true" />
        <span>{task.description || task.kind}</span>
      </div>
      {progress?.summary && (
        <p className="background-task-summary" aria-live="polite">
          <span key={progress.summary} className="task-summary-update">
            {progress.summary}
          </span>
        </p>
      )}
      <small className="background-task-meta">
        {firstSeen && (
          <span
            className="task-wait-time"
            title="从当前已加载记录中首次看到此任务开始计时；不代表实际执行时长"
          >
            已等待 {duration(firstSeen, now)} ·{' '}
          </span>
        )}
        <span>
          {!connected ? '连接中断，进度更新已暂停' : !progress ? '任务尚未报告进度' : null}
        </span>
        {progress && (
          <>
            {!connected && ' · '}
            已运行 {duration('1970-01-01T00:00:00Z', progress.elapsedSeconds * 1000)} · 最近上报{' '}
            <time dateTime={progress.updatedAt}>
              {new Date(progress.updatedAt).toLocaleTimeString()}
            </time>
            {connected && age >= 60000 && ` · ${duration('1970-01-01T00:00:00Z', age)}未收到新进度`}
          </>
        )}
      </small>
    </div>
  );
}
