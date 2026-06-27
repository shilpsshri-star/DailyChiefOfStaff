import { redirect } from "next/navigation";

// Free-form chat was replaced by the structured goal -> milestone -> step
// workflow. Send anyone who lands here to the goals list.
export default function ChatRedirect() {
  redirect("/goals");
}
