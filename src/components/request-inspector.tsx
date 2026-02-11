"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ParseEntry } from "@/lib/har-types";

function getPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function getBadges(entry: ParseEntry): string[] {
  const badges: string[] = [];
  const url = entry.url.toLowerCase();
  const contentType =
    entry.headers?.find((h) => h.name.toLowerCase() === "content-type")
      ?.value ?? "";
  if (url.includes("graphql") || contentType.includes("application/graphql")) {
    badges.push("GraphQL");
  }
  const xRequestedWith = entry.headers?.find(
    (h) => h.name.toLowerCase() === "x-requested-with"
  )?.value;
  if (xRequestedWith?.toLowerCase().includes("xmlhttprequest")) {
    badges.push("XHR");
  }
  if (badges.length === 0) badges.push("API");
  return badges;
}

function statusClass(status: number): string {
  if (status >= 200 && status < 300) return "text-green-600 dark:text-green-400";
  if (status >= 300 && status < 400) return "text-blue-600 dark:text-blue-400";
  if (status >= 400) return "text-destructive";
  return "text-muted-foreground";
}

export interface RequestInspectorProps {
  entries: ParseEntry[];
  selectedIndex: number | null;
  onSelectIndex: (index: number | null) => void;
  matchedIndex: number | null;
}

export function RequestInspector({
  entries,
  selectedIndex,
  onSelectIndex,
  matchedIndex,
}: RequestInspectorProps) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!filter.trim()) return entries;
    const q = filter.trim().toLowerCase();
    return entries.filter((e, i) => {
      const path = getPathname(e.url);
      const origin = getOrigin(e.url);
      const line = `${e.method} ${path} ${e.status} ${origin}`.toLowerCase();
      return line.includes(q);
    });
  }, [entries, filter]);

  const selectedEntry =
    selectedIndex != null && selectedIndex >= 0 && selectedIndex < entries.length
      ? entries[selectedIndex]
      : null;

  return (
    <div className="flex h-full flex-col gap-3">
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="flex-none px-4 py-3">
          <CardTitle className="text-base">Requests</CardTitle>
          <input
            type="text"
            placeholder="search / filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
          {filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              {entries.length === 0
                ? "Upload a .har file to see requests"
                : "No requests match the filter"}
            </p>
          ) : (
          <ul className="divide-y divide-border">
            {filtered.map((entry) => {
              const globalIndex = entries.indexOf(entry);
              const path = getPathname(entry.url);
              const badges = getBadges(entry);
              const isSelected = selectedIndex === globalIndex;
              const isMatch = matchedIndex === globalIndex;
              return (
                <li key={globalIndex}>
                  <button
                    type="button"
                    onClick={() =>
                      onSelectIndex(isSelected ? null : globalIndex)
                    }
                    className={cn(
                      "w-full px-4 py-2 text-left text-sm transition-colors hover:bg-accent",
                      isSelected && "bg-accent",
                      isMatch && "ring-1 ring-primary"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium">
                        {entry.method.padEnd(6)}
                      </span>
                      <span className="truncate font-mono text-muted-foreground">
                        {path}
                      </span>
                      <span
                        className={cn(
                          "ml-auto shrink-0 font-mono text-xs",
                          statusClass(entry.status)
                        )}
                      >
                        {entry.status}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {badges.map((b) => (
                        <span
                          key={b}
                          className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          )}
        </CardContent>
      </Card>

      {selectedEntry && (
        <Card className="flex min-h-0 flex-1 flex-col">
          <CardHeader className="flex-none px-4 py-3">
            <CardTitle className="text-base">Request Details</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto space-y-4 px-4 pb-4">
            <section>
              <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Headers
              </h4>
              <pre className="max-h-32 overflow-auto rounded border border-input bg-muted/30 p-2 text-xs font-mono">
                {selectedEntry.headers?.length
                  ? selectedEntry.headers
                      .map((h) => `${h.name}: ${h.value}`)
                      .join("\n")
                  : "(none)"}
              </pre>
            </section>
            {selectedEntry.queryString && selectedEntry.queryString.length > 0 && (
              <section>
                <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  Query
                </h4>
                <pre className="max-h-24 overflow-auto rounded border border-input bg-muted/30 p-2 text-xs font-mono">
                  {selectedEntry.queryString
                    .map((q) => `${q.name}=${q.value}`)
                    .join("\n")}
                </pre>
              </section>
            )}
            <section>
              <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Body
              </h4>
              <pre className="max-h-48 overflow-auto rounded border border-input bg-muted/30 p-2 text-xs font-mono">
                {selectedEntry.postData?.text
                  ? (() => {
                      try {
                        return JSON.stringify(
                          JSON.parse(selectedEntry.postData!.text!),
                          null,
                          2
                        );
                      } catch {
                        return selectedEntry.postData.text;
                      }
                    })()
                  : "{}"}
              </pre>
            </section>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
