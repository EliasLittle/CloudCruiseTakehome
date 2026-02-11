"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const ACCEPT = ".har";

export interface HarUploadBarProps {
  file: File | null;
  parseCount: number | null;
  parseError: string | null;
  parseLoading: boolean;
  onFileSelected: (file: File | null) => void;
  onParseRequested: (file: File) => void;
  onClear: () => void;
}

export function HarUploadBar({
  file,
  parseCount,
  parseError,
  parseLoading,
  onFileSelected,
  onParseRequested,
  onClear,
}: HarUploadBarProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((f: File) => {
    return f.name.toLowerCase().endsWith(ACCEPT);
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (!selected) return;
      if (!validateFile(selected)) {
        onFileSelected(null);
        return;
      }
      onFileSelected(selected);
      onParseRequested(selected);
    },
    [validateFile, onFileSelected, onParseRequested]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files?.[0];
      if (!dropped) return;
      if (!validateFile(dropped)) {
        onFileSelected(null);
        return;
      }
      onFileSelected(dropped);
      onParseRequested(dropped);
    },
    [validateFile, onFileSelected, onParseRequested]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "flex min-h-[56px] flex-wrap items-center gap-3 rounded-lg border-2 border-dashed border-input bg-muted/30 px-4 py-3 transition-colors",
          isDragging && "border-primary bg-muted/50",
          parseError && "border-destructive/50"
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={handleFileChange}
          className="sr-only"
          id="har-upload"
        />
        <span className="text-sm font-medium text-muted-foreground">
          Upload .har file
        </span>
        <button
          type="button"
          onClick={handleClick}
          className="rounded border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
          disabled={parseLoading}
        >
          {file ? "Replace file" : "drag & drop"}
        </button>
        {file && (
          <>
            <span className="text-sm font-medium text-foreground">
              {file.name}
            </span>
            {parseLoading && (
              <span className="text-sm text-muted-foreground">Parsing…</span>
            )}
            {!parseLoading && parseCount !== null && (
              <span className="text-sm text-green-600 dark:text-green-400">
                ✓ Parsed ({parseCount})
              </span>
            )}
            {!parseLoading && parseError && (
              <span className="text-sm text-destructive">{parseError}</span>
            )}
            <button
              type="button"
              onClick={onClear}
              className="ml-auto rounded px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  );
}
