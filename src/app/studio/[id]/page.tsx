import Studio from "./Studio";

// The editor loads its data client-side with the private edit token, so the
// server only needs the id. Blocking on params is fine and avoids a streaming shell.
export const instant = false;

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Studio id={id} />;
}
