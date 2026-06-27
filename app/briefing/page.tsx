import { redirect } from "next/navigation";

// Superseded by the Daily Loop page (morning focus + evening check-in).
export default function BriefingRedirect() {
  redirect("/daily");
}
