import { getWatchlist } from "@/lib/watchlist";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  return <SettingsClient initialWatchlist={await getWatchlist()} />;
}
