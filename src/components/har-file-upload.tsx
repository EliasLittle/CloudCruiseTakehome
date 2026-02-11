"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ACCEPT = ".har";

export function HarFileUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [apiDescription, setApiDescription] = useState("");
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [curlOutput, setCurlOutput] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const validateFile = useCallback((f: File) => {
    return f.name.toLowerCase().endsWith(ACCEPT);
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (!selected) return;
      if (!validateFile(selected)) {
        setStatus("error");
        setErrorMessage("Only .har (HTTP Archive) files are accepted.");
        setFile(null);
        return;
      }
      setFile(selected);
      setStatus("idle");
      setErrorMessage(null);
    },
    [validateFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files?.[0];
      if (!dropped) return;
      if (!validateFile(dropped)) {
        setStatus("error");
        setErrorMessage("Only .har (HTTP Archive) files are accepted.");
        setFile(null);
        return;
      }
      setFile(dropped);
      setStatus("idle");
      setErrorMessage(null);
    },
    [validateFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!file) return;
    setStatus("uploading");
    setErrorMessage(null);
    setCurlOutput(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("description", apiDescription);
      const res = await fetch("/api/upload-har", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setErrorMessage(data.error ?? "Upload failed");
        return;
      }
      setStatus("success");
      setCurlOutput(data.curl ?? "");
    } catch {
      setStatus("error");
      setErrorMessage("Upload failed. Please try again.");
    }
  }, [file, apiDescription]);

  const handleClear = useCallback(() => {
    setFile(null);
    setApiDescription("");
    setStatus("idle");
    setErrorMessage(null);
    setCurlOutput(null);
  }, []);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Upload HAR file</CardTitle>
        <CardDescription>
          Choose a .har (HTTP Archive) file to upload. Only .har files are accepted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="api-description"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            API description
          </label>
          <textarea
            id="api-description"
            placeholder="Describe the API you want to reverse-engineer (e.g. endpoints, auth, purpose)"
            value={apiDescription}
            onChange={(e) => setApiDescription(e.target.value)}
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[80px]"
          />
        </div>

        <div
          className={cn(
            "flex min-h-[120px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-input bg-muted/30 px-4 py-6 transition-colors",
            isDragging && "border-primary bg-muted/50",
            status === "error" && "border-destructive/50"
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            type="file"
            accept={ACCEPT}
            onChange={handleFileChange}
            className="sr-only"
            id="har-upload"
          />
          <label
            htmlFor="har-upload"
            className="cursor-pointer text-center text-sm text-muted-foreground"
          >
            {file ? (
              <span className="font-medium text-foreground">{file.name}</span>
            ) : (
              <>
                <span className="font-medium text-foreground">Click to browse</span>
                {" or drag a .har file here"}
              </>
            )}
          </label>
        </div>

        {errorMessage && (
          <p className="text-sm text-destructive">{errorMessage}</p>
        )}

        {status === "success" && (
          <div className="space-y-2">
            <p className="text-sm text-green-600 dark:text-green-400">Extracted curl command(s):</p>
            {curlOutput ? (
              <pre className="max-h-64 overflow-auto rounded-md border border-input bg-muted/50 p-3 text-left text-xs font-mono">
                <code className="whitespace-pre-wrap break-all">{curlOutput}</code>
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">No non-HTML requests found in the HAR file.</p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleSubmit}
            disabled={!file || status === "uploading"}
          >
            {status === "uploading" ? "Uploading…" : "Upload"}
          </Button>
          {(file || status !== "idle") && (
            <Button variant="outline" onClick={handleClear} disabled={status === "uploading"}>
              Clear
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
