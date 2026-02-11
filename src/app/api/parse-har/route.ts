import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json(
      { success: false, error: "No file provided" },
      { status: 400 }
    );
  }

  if (!file.name.toLowerCase().endsWith(".har")) {
    return NextResponse.json(
      { success: false, error: "Only .har files are accepted" },
      { status: 400 }
    );
  }

  try {
    const backendFormData = new FormData();
    backendFormData.append("file", file);

    const res = await fetch(`${BACKEND_URL}/extract-har/parse`, {
      method: "POST",
      body: backendFormData,
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

    const data = JSON.parse(text) as { count: number; entries: unknown[] };
    return NextResponse.json({
      success: true,
      count: data.count,
      entries: data.entries,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Could not reach the backend. Is it running?" },
      { status: 502 }
    );
  }
}
