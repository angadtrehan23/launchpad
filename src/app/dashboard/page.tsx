import type { Metadata } from "next";
import Dashboard from "./Dashboard";

export const metadata: Metadata = { title: "My stores · Launchpad", robots: { index: false } };

export default function DashboardPage() {
  return <Dashboard />;
}
