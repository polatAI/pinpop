import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Question } from "@/shared";
import { TYPE_COLORS, TypeIcon } from "./typeIcons";

interface ListProps {
  questions: Question[];
  selectedId: string | null;
  invalidIds: Set<string>;
  onSelect: (id: string) => void;
  onReorder: (questions: Question[]) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  orientation?: "vertical" | "horizontal";
}

function SortableItem({
  question,
  index,
  selected,
  invalid,
  onSelect,
  onDuplicate,
  onDelete,
  horizontal,
}: {
  question: Question;
  index: number;
  selected: boolean;
  invalid: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  horizontal: boolean;
}) {
  const { t } = useTranslation("editor");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: question.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  if (horizontal) {
    return (
      <li ref={setNodeRef} style={style} className={cn("shrink-0", isDragging && "z-10 opacity-80")}>
        <button
          type="button"
          onClick={onSelect}
          {...attributes}
          {...listeners}
          aria-label={t("list.questionN", { n: index + 1 })}
          aria-current={selected}
          className={cn(
            "relative flex h-14 w-14 flex-col items-center justify-center rounded-2xl border-2 text-sm font-bold transition-colors",
            selected
              ? "border-pop-500 bg-pop-50 text-pop-700 dark:bg-pop-900/30 dark:text-pop-200"
              : "border-border bg-surface",
          )}
        >
          <TypeIcon type={question.type} className="size-4" />
          {index + 1}
          {invalid ? (
            <span className="absolute -top-1 -right-1 size-3 rounded-full border-2 border-surface bg-[#e5383b]" />
          ) : null}
        </button>
      </li>
    );
  }

  return (
    <li ref={setNodeRef} style={style} className={cn("group relative", isDragging && "z-10 opacity-80")}>
      <div
        className={cn(
          "flex items-stretch gap-1 rounded-2xl border-2 transition-colors",
          selected ? "border-pop-500 bg-pop-50 dark:bg-pop-900/25" : "border-border bg-surface hover:border-pop-300",
        )}
      >
        <button
          type="button"
          className="flex cursor-grab touch-none items-center px-1 text-muted active:cursor-grabbing"
          aria-label={t("list.drag")}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
          onClick={onSelect}
          aria-current={selected}
          className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5 text-left"
        >
          <span className="w-5 shrink-0 text-right font-display text-sm font-bold text-muted">{index + 1}</span>
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-xl border-2 border-ink-900 text-white dark:border-black",
              TYPE_COLORS[question.type],
            )}
          >
            <TypeIcon type={question.type} className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-sm font-semibold", !question.text && "text-muted italic")}>
              {question.text || t("list.untitled")}
            </span>
            <span className="block text-xs text-muted">
              {t(`common:questionTypes.${question.type}`)} · {t("common:seconds", { count: question.timeLimit })}
            </span>
          </span>
          {invalid ? (
            <span className="size-2.5 shrink-0 rounded-full bg-[#e5383b]" title={t("list.hasErrors")}>
              <span className="sr-only">{t("list.hasErrors")}</span>
            </span>
          ) : null}
        </button>
        <div className="flex flex-col justify-center pr-1 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          <button
            type="button"
            onClick={onDuplicate}
            className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg"
            aria-label={t("list.duplicate")}
            title={t("list.duplicate")}
          >
            <Copy className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg p-1 text-muted hover:bg-[#e5383b]/10 hover:text-[#e5383b]"
            aria-label={t("list.delete")}
            title={t("list.delete")}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

export function QuestionList({
  questions,
  selectedId,
  invalidIds,
  onSelect,
  onReorder,
  onDuplicate,
  onDelete,
  orientation = "vertical",
}: ListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const horizontal = orientation === "horizontal";

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = questions.findIndex((q) => q.id === active.id);
    const to = questions.findIndex((q) => q.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(questions, from, to));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext
        items={questions.map((q) => q.id)}
        strategy={horizontal ? horizontalListSortingStrategy : verticalListSortingStrategy}
      >
        <ol className={cn(horizontal ? "flex gap-2 overflow-x-auto px-1 py-1" : "flex flex-col gap-2")}>
          {questions.map((q, i) => (
            <SortableItem
              key={q.id}
              question={q}
              index={i}
              selected={q.id === selectedId}
              invalid={invalidIds.has(q.id)}
              onSelect={() => onSelect(q.id)}
              onDuplicate={() => onDuplicate(q.id)}
              onDelete={() => onDelete(q.id)}
              horizontal={horizontal}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
