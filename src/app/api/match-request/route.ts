import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be JSON" },
      { status: 400 }
    );
  }

  if (body == null || typeof body !== "object") {
    return NextResponse.json(
      { success: false, error: "Request body must be an object" },
      { status: 400 }
    );
  }

  const obj = body as Record<string, unknown>;
  const description = obj.description;
  const entries = obj.entries;

  if (typeof description !== "string" || !description.trim()) {
    return NextResponse.json(
      { success: false, error: "description is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  if (!Array.isArray(entries)) {
    return NextResponse.json(
      { success: false, error: "entries must be an array" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${BACKEND_URL}/extract-har/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: description.trim(), entries }),
    });

    const text = await res.text();

    if (!res.ok) {
      let errorMessage = "Backend request failed.";
      try {
        const json = JSON.parse(text) as { message?: string | string[] };
        if (Array.isArray(json.message)) {
          errorMessage = json.message[0] ?? errorMessage;
        } else if (typeof json.message === "string") {
          errorMessage = json.message;
        }
      } catch {
        if (text) errorMessage = text.slice(0, 200);
      }
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 }
      );
    }

    const data = JSON.parse(text) as {
      curl: string;
      matchedIndex?: number;
      confidence?: string;
      explanationBullets?: string[];
    };
    return NextResponse.json({
      success: true,
      curl: data.curl,
      matchedIndex: data.matchedIndex,
      confidence: data.confidence,
      explanationBullets: data.explanationBullets,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Could not reach the backend. Is it running?" },
      { status: 502 }
    );
  }
}
