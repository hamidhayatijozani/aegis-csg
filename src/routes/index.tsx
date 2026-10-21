import { AppShell } from "@/components/app-shell";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <AppShell />;
}
