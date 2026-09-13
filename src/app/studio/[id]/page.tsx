import { SiteHeader } from "@/components/site-header";
import { CreatorStudio } from "@/components/creator-studio";

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <SiteHeader />
      <CreatorStudio streamId={id} />
    </>
  );
}
