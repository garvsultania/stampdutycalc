import { headers } from "next/headers";
import { WORKSPACE_UNAVAILABLE_PUBLIC_DETAIL, WorkspaceUnavailableError } from "@/lib/store-server";
import { authorizeWorkspace, WorkspaceAuthorizationError } from "@/lib/api-workspace";
import { MattersList, AuthNotice } from "@/components/workspace-client";
import { WorkspaceUnavailable } from "@/components/workspace-unavailable";

export const metadata = { title: "Workspace — StampDraft" };
export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  let matters;
  let firmId: string;
  try {
    const workspace = await authorizeWorkspace(headers());
    firmId = workspace.firmId;
    matters = await workspace.store.listMatters(firmId);
  } catch (error: unknown) {
    if (error instanceof WorkspaceAuthorizationError) {
      return <div className="container py-8"><p role="alert">Sign in with an authorized firm account to access the workspace.</p></div>;
    }
    if (error instanceof WorkspaceUnavailableError) {
      return (
        <div className="container py-8">
          <WorkspaceUnavailable detail={WORKSPACE_UNAVAILABLE_PUBLIC_DETAIL} showLocalSetup={process.env.NODE_ENV !== "production"} />
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
