import { NextResponse } from "next/server";

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

  // Generic backend: for now just acknowledge receipt
  return NextResponse.json({ success: true });
}
