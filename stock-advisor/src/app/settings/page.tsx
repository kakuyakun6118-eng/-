import { getWatchlist } from "@/lib/watchlist";
import { getWatchedAccounts } from "@/lib/watchedAccounts";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [watchlist, accounts] = await Promise.all([getWatchlist(), getWatchedAccounts()]);
  return <SettingsClient initialWatchlist={watchlist} initialAccounts={accounts} />;
}
