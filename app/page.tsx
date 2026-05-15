import { redirect } from "next/navigation";

// Root path always redirects — middleware handles the exact destination
// based on session cookies (super-admin → /super-admin, tenant → /dashboard).
export default function RootPage() {
  redirect("/login");
}
