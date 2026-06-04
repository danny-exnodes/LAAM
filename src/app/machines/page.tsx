import { redirect } from "next/navigation";

// Machines moved under Settings. Keep the old /machines URL working
// (bookmarks / external links) by redirecting to the new location.
export default function MachinesRedirect() {
  redirect("/settings/machines");
}
