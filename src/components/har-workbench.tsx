"use client";

import { useCallback, useState } from "react";
import { HarUploadBar } from "@/components/har-upload-bar";
import { RequestInspector } from "@/components/request-inspector";
import { MatchAndCurl } from "@/components/match-and-curl";
import type { ParseEntry } from "@/lib/har-types";
import type { MatchResult } from "@/lib/har-types";

export function HarWorkbench() {
  const [file, setFile] = useState<File | null>(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [entries, setEntries] = useState<ParseEntry[]>([]);
  const [parseCount, setParseCount] = useState<number | null>(null);
  const [selectedEntryIndex, setSelectedEntryIndex] = useState<number | null>(
    null
  );
  const [apiDescription, setApiDescription] = useState("");
  const [findResult, setFindResult] = useState<MatchResult | null>(null);
  const [findLoading, setFindLoading] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);

  const handleFileSelected = useCallback((f: File | null) => {
    setFile(f);
    if (!f) {
      setEntries([]);
      setParseCount(null);
      setParseError(null);
      setFindResult(null);
      setSelectedEntryIndex(null);
    }
  }, []);

  const handleParseRequested = useCallback(async (f: File) => {
    setParseLoading(true);
    setParseError(null);
    setFindResult(null);
    try {
      const formData = new FormData();
      formData.append("file", f);
      const res = await fetch("/api/parse-har", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setParseError(data.error ?? "Parse failed");
        setEntries([]);
        setParseCount(null);
        return;
      }
      setEntries(data.entries ?? []);
      setParseCount(data.count ?? 0);
    } catch {
      setParseError("Could not reach the server.");
      setEntries([]);
      setParseCount(null);
    } finally {
      setParseLoading(false);
    }
  }, []);

  const handleClear = useCallback(() => {
    setFile(null);
    setParseLoading(false);
    setParseError(null);
    setEntries([]);
    setParseCount(null);
    setSelectedEntryIndex(null);
    setApiDescription("");
    setFindResult(null);
    setFindError(null);
  }, []);

  const handleFind = useCallback(async () => {
    if (entries.length === 0 || !apiDescription.trim()) return;
    setFindLoading(true);
    setFindError(null);
    try {
      const res = await fetch("/api/match-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: apiDescription.trim(),
          entries,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFindError(data.error ?? "Match failed");
        setFindResult(null);
        return;
      }
      setFindResult({
        curl: data.curl ?? "",
        matchedIndex: data.matchedIndex,
        confidence: data.confidence,
        explanationBullets: data.explanationBullets,
      });
    } catch {
      setFindError("Could not reach the server.");
      setFindResult(null);
    } finally {
      setFindLoading(false);
    }
  }, [entries, apiDescription]);

  const matchedIndex = findResult?.matchedIndex ?? null;

  return (
    <div className="flex h-screen flex-col gap-4 p-4">
      <HarUploadBar
        file={file}
        parseCount={parseCount}
        parseError={parseError}
        parseLoading={parseLoading}
        onFileSelected={handleFileSelected}
        onParseRequested={handleParseRequested}
        onClear={handleClear}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex min-h-0 flex-col overflow-hidden">
          <RequestInspector
            entries={entries}
            selectedIndex={selectedEntryIndex}
            onSelectIndex={setSelectedEntryIndex}
            matchedIndex={matchedIndex}
          />
        </div>
        <div className="flex min-h-0 flex-col overflow-y-auto">
          <MatchAndCurl
            apiDescription={apiDescription}
            setApiDescription={setApiDescription}
            entries={entries}
            findResult={findResult}
            findLoading={findLoading}
            findError={findError}
            onFind={handleFind}
            entriesCount={entries.length}
          />
        </div>
      </div>
    </div>
  );
}
