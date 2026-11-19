import { isTaskTag } from './types';

const TAG_CLASS: Record<string, string> = {
  Request: 'bg-sky-100 text-sky-800',
  Idea: 'bg-amber-100 text-amber-800',
};

export function TaskTags({ tags }: { tags?: string[] | null }) {
  const list = Array.isArray(tags) ? tags.filter(isTaskTag) : [];
  if (!list.length) return null;
  return (
    <>
      {list.map((tag) => (
        <span
          key={tag}
          data-testid="task-tag"
          data-tag={tag}
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${TAG_CLASS[tag] || 'bg-slate-100 text-slate-600'}`}
        >
          {tag}
        </span>
      ))}
    </>
  );
}
