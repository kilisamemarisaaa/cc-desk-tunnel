import { useEffect, useState } from 'react';
import type { EventPayload } from '@cc-desk-tunnel/protocol';
import { duration } from './activity.ts';

type Task = Extract<EventPayload, { type: 'native.tasks' }>['tasks'][number];

export default function BackgroundTaskProgress({
  task,
  connected,
}: {
  task: Task;
  connected: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  const progress = task.progress;
  useEffect(() => {
    setNow(Date.now());
    if (!connected || !progress) return;
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, [connected, progress?.updatedAt]);
  const age = progress ? Math.max(0, now - Date.parse(progress.updatedAt)) : 0;
  return (
    <div className="background-task-detail">
      <span>{task.description || task.kind}</span>
      {progress?.summary && (
        <p className="background-task-summary" aria-live="polite">
          {progress.summary}
        </p>
      )}
      <small className="background-task-meta">
        {!connected ? '连接中断，进度更新已暂停' : !progress ? '任务尚未报告进度' : null}
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
