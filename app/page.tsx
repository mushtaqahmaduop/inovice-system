import { redirect } from "next/navigation";

// The root has no content of its own — the middleware sends anonymous
// visitors to /login and everyone else lands on the dashboard.
export default function Home() {
  redirect("/dashboard");
}
