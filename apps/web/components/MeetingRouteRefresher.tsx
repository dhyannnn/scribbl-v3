import { AccessRouteRefresher } from "./AccessRouteRefresher";

export function MeetingRouteRefresher() {
  return <AccessRouteRefresher intervalMs={10000} preserveScroll />;
}
