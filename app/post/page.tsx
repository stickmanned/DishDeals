import { CanonicalPost, LegacyPostLinkNotice, PreviewPost } from "@/components/deals/CanonicalPost";
import { MyPublishedDeals } from "@/components/deals/MyPublishedDeals";
import { parsePostSourceParam } from "@/lib/postSource";

export const metadata = { title: "Post a deal", referrer: "no-referrer" };

type Params = {
  edit?: string | string[];
  job?: string | string[];
  preview?: string | string[];
  source?: string | string[];
};
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// /post is the canonical live flow (real auth, owned upload, common review form, deals.create).
// ?preview=1 is the explicitly labeled example Post. Old ?edit= and ?job= links get an honest notice and
// never open an editor or an import job.
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const edit = first(params.edit);
  const job = first(params.job);
  if (edit !== undefined) return <LegacyPostLinkNotice kind="edit" id={edit} />;
  if (job !== undefined) return <LegacyPostLinkNotice kind="job" />;
  if (first(params.preview) === "1") return <PreviewPost />;
  const initialSourceUrl = parsePostSourceParam(params.source);
  return (
    <>
      <CanonicalPost initialSourceUrl={initialSourceUrl ?? undefined} />
      <MyPublishedDeals />
    </>
  );
}
