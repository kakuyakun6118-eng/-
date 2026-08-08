import { listHoldings } from "@/lib/holdingsStore";
import HoldingsClient from "./HoldingsClient";

export const dynamic = "force-dynamic";

export default async function HoldingsPage() {
  const holdings = await listHoldings();
  return <HoldingsClient initialHoldings={holdings} />;
}
