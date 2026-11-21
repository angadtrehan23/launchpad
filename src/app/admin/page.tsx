import type { Metadata } from "next";
import Admin from "./Admin";

export const metadata: Metadata = { title: "Creators · Launchpad admin", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <Admin />;
}
