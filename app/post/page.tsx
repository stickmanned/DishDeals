import { Post } from "@/components/frontend/Post";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; job?: string }>;
}) {
  const { edit, job } = await searchParams;
  const jobId =
    typeof job === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(job)
      ? job
      : undefined;
  return <Post editId={edit} jobId={jobId} />;
}
