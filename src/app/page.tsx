import { HarFileUpload } from "@/components/har-file-upload";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-24">
      <h1 className="text-2xl font-semibold">CloudCruise</h1>
      <HarFileUpload />
    </main>
  );
}
