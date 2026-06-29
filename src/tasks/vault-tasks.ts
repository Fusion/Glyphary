import type { SearchResult, TaskFilter, TaskSort } from "../lib/app-types";

// Responsibilities:
// - Keep task-search regexes and task drawer presentation rules together.
// Contracts:
// - Task rows parse standard Markdown checkbox syntax.
// - Date sort falls back to stable task/file ordering.

export function taskSearchPattern(filter: TaskFilter) {
  if (filter === "complete") {
    return "- \\[[xX]\\]";
  }

  if (filter === "all") {
    return "- \\[( |[xX])\\]";
  }

  return "- \\[ \\]";
}

export function taskResultPresentation(lineText: string | null | undefined) {
  const line = lineText?.trim() || "Task";
  const match = line.match(/^- \[([ xX])\]\s*(.*)$/);

  if (!match) {
    return {
      label: line,
      completed: false,
    };
  }

  return {
    label: match[2] || "Task",
    completed: match[1].toLowerCase() === "x",
  };
}

export function visibleVaultTaskResults(
  taskResults: SearchResult[],
  taskListQuery: string,
  taskSort: TaskSort,
) {
  const query = taskListQuery.trim().toLowerCase();

  return taskResults
    .filter((result) => {
      if (!query) {
        return true;
      }

      const task = taskResultPresentation(result.lineText);
      const searchableText = `${task.label} ${result.relativePath}`.toLowerCase();

      return searchableText.includes(query);
    })
    .sort((left, right) => {
      if (taskSort === "date") {
        const byDate = (right.modifiedMs ?? 0) - (left.modifiedMs ?? 0);

        if (byDate !== 0) {
          return byDate;
        }
      }

      const leftTask = taskResultPresentation(left.lineText);
      const rightTask = taskResultPresentation(right.lineText);
      const byName = leftTask.label.localeCompare(rightTask.label, undefined, {
        sensitivity: "base",
      });

      if (byName !== 0) {
        return byName;
      }

      return `${left.relativePath}:${left.lineNumber ?? 0}`.localeCompare(
        `${right.relativePath}:${right.lineNumber ?? 0}`,
      );
    });
}
