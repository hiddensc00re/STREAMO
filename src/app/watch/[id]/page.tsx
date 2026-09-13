import { SiteHeader } from "@/components/site-header";
import { ViewerStage } from "@/components/viewer-stage";

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <SiteHeader />
      <ViewerStage streamId={id} />
    </>
  );
}
