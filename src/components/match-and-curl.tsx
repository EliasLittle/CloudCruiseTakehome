"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  executeRequest,
  type ExecuteResult,
} from "@/lib/execute-request";
import type { ParseEntry } from "@/lib/har-types";
import type { MatchResult } from "@/lib/har-types";

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "x-api-key",
  "x-auth-token",
  "api-key",
]);


function getPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export interface MatchAndCurlProps {
  apiDescription: string;
  setApiDescription: (value: string) => void;
  entries: ParseEntry[];
  findResult: MatchResult | null;
  findLoading: boolean;
  findError: string | null;
  onFind: () => void;
  entriesCount: number;
}

export function MatchAndCurl({
  apiDescription,
  setApiDescription,
  entries,
  findResult,
  findLoading,
  findError,
  onFind,
  entriesCount,
}: MatchAndCurlProps) {
  const [copied, setCopied] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);

  const displayCurl = findResult?.curl
    ? findResult.curl
    : "";

  const handleCopy = useCallback(async () => {
    if (!displayCurl) return;
    try {
      await navigator.clipboard.writeText(displayCurl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [displayCurl]);

  const matchedEntry =
    findResult?.matchedIndex != null &&
    findResult.matchedIndex >= 0 &&
    findResult.matchedIndex < entries.length
      ? entries[findResult.matchedIndex]
      : null;

  const canFind = entriesCount > 0 && apiDescription.trim().length > 0;
  const canExecute = !!matchedEntry;

  useEffect(() => {
    setExecuteResult(null);
    setExecuteError(null);
  }, [findResult?.matchedIndex]);

  const handleExecute = useCallback(async () => {
    if (!matchedEntry) return;
    setExecuteLoading(true);
    setExecuteError(null);
    setExecuteResult(null);
    try {
      const result = await executeRequest(matchedEntry);
      setExecuteResult(result);
    } catch (err) {
      setExecuteError(
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setExecuteLoading(false);
    }
  }, [matchedEntry]);

  return (
    <div className="flex h-full flex-col gap-4">
      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base">Describe the API</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <textarea
            placeholder="Create a new subscription for a user with a monthly plan"
            value={apiDescription}
            onChange={(e) => setApiDescription(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[80px]"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Describe what the API does, not how it&apos;s implemented.
          </p>
          <Button
            type="button"
            onClick={onFind}
            disabled={!canFind || findLoading}
            className="mt-3"
          >
            {findLoading ? "Finding…" : "Find matching request"}
          </Button>
        </CardContent>
      </Card>

      {findError && (
        <p className="text-sm text-destructive">{findError}</p>
      )}

      {findResult && (
        <>
          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-base">Best Match</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4">
              {matchedEntry && (
                <p className="font-mono text-sm">
                  {matchedEntry.method} {getPathname(matchedEntry.url)}
                </p>
              )}
              {findResult.confidence && (
                <p className="text-sm text-muted-foreground">
                  Confidence: {findResult.confidence}
                </p>
              )}
              {findResult.explanationBullets &&
                findResult.explanationBullets.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">
                      Why this request:
                    </p>
                    <ul className="list-inside list-disc space-y-0.5 text-sm">
                      {findResult.explanationBullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-none px-4 py-3">
              <CardTitle className="text-base">Generated curl</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              <pre className="max-h-64 overflow-auto rounded border border-input bg-muted/50 p-3 text-left text-xs font-mono whitespace-pre-wrap break-all">
                <code>{displayCurl || "(none)"}</code>
              </pre>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  disabled={!displayCurl}
                >
                  {copied ? "Copied!" : "Copy"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExecute}
                  disabled={!canExecute || executeLoading}
                >
                  {executeLoading ? "Executing…" : "Execute"}
                </Button>
              </div>

              {executeError && (
                <div className="mt-3 rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  {executeError}
                </div>
              )}

              {executeResult && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm font-medium">
                    Response: {executeResult.status} {executeResult.statusText}
                  </p>
                  <pre className="max-h-48 overflow-auto rounded border border-input bg-muted/50 p-3 text-left text-xs font-mono whitespace-pre-wrap break-all">
                    <code>
                      {executeResult.body || "(empty body)"}
                    </code>
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
