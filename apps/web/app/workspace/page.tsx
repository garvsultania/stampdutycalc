import { getStore, WorkspaceUnavailableError } from "@/lib/store-server";
import { MattersList, AuthNotice } from "@/components/workspace-client";
import { WorkspaceUnavailable } from "@/components/workspace-unavailable";

export const metadata = { title: "Workspace — StampDraft" };
export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  let matters;
  let firmId: string;
  try {
    const workspace = await getStore();
    firmId = workspace.firmId;
    matters = await workspace.store.listMatters(firmId);
  } catch (error: unknown) {
    if (error instanceof WorkspaceUnavailableError) {
      return (
        <div className="container py-8">
          <WorkspaceUnavailable detail={error.detail} />
        </div>
      );
    }
    throw error;
  }

  return (
    <div className="container space-y-5 py-8">
      <AuthNotice />
      <MattersList initial={JSON.parse(JSON.stringify(matters))} />
    </div>
  );
}
