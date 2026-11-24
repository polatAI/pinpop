import { useInfiniteQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { PageContainer, PageHeader, QuizCard } from "@/components/pages/common";
import { Button, EmptyState, Input, Select, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { LANGUAGES } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Paginated, QuizSummary } from "@/shared";

const PAGE_SIZE = 24;

export default function Discover() {
  const { t } = useTranslation("pages");
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const q = params.get("q") ?? "";
  const tag = params.get("tag") ?? "";
  const language = params.get("language") ?? "";
  const sort = params.get("sort") === "recent" ? "recent" : "popular";

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: debounce only reacts to typing
  useEffect(() => {
    const id = setTimeout(() => {
      if (search.trim() !== q) update({ q: search.trim() });
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const query = useInfiniteQuery({
    queryKey: ["discover", q, tag, language, sort],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams({ sort, page: String(pageParam), pageSize: String(PAGE_SIZE) });
      if (q) sp.set("q", q);
      if (tag) sp.set("tag", tag);
      if (language) sp.set("language", language);
      return api.get<Paginated<QuizSummary>>(`/api/discover?${sp}`);
    },
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });

  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const quiz of items) for (const tg of quiz.tags) counts.set(tg, (counts.get(tg) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([k]) => k);
  }, [items]);

  return (
    <PageContainer>
      <PageHeader title={t("discover.title")} description={t("discover.subtitle")} />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("discover.searchPlaceholder")}
            className="pl-11"
            aria-label={t("common:actions.search")}
          />
        </div>
        <Select
          value={language}
          onChange={(e) => update({ language: e.target.value })}
          className="sm:w-44"
          aria-label={t("discover.language")}
        >
          <option value="">{t("discover.allLanguages")}</option>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </Select>
        <Select
          value={sort}
          onChange={(e) => update({ sort: e.target.value })}
          className="sm:w-44"
          aria-label={t("discover.sort")}
        >
          <option value="popular">{t("discover.popular")}</option>
          <option value="recent">{t("discover.recent")}</option>
        </Select>
      </div>

      {tags.length > 0 || tag ? (
        <div className="mb-6 flex flex-wrap gap-2">
          {tag ? (
            <button
              type="button"
              onClick={() => update({ tag: "" })}
              className="inline-flex items-center gap-1 rounded-full border-2 border-ink-900 bg-pop-500 px-3 py-1 text-sm font-semibold text-white dark:border-black"
            >
              #{tag} <X className="size-3.5" />
            </button>
          ) : null}
          {tags
            .filter((tg) => tg !== tag)
            .map((tg) => (
              <button
                key={tg}
                type="button"
                onClick={() => update({ tag: tg })}
                className={cn(
                  "rounded-full border-2 border-border bg-surface px-3 py-1 text-sm font-semibold text-muted hover:border-pop-400 hover:text-fg",
                )}
              >
                #{tg}
              </button>
            ))}
        </div>
      ) : null}

      {query.isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState icon="🧭" title={t("discover.emptyTitle")} description={t("discover.emptyText")} />
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((quiz) => (
              <QuizCard key={quiz.id} quiz={quiz} to={`/quiz/${quiz.id}`} />
            ))}
          </div>
          {query.hasNextPage ? (
            <div className="mt-8 flex justify-center">
              <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                {t("common:actions.loadMore")}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </PageContainer>
  );
}
