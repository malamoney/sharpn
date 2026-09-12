/**
 * `loading` and `failed`, and `failed`'s three distinguishable causes
 * (issue #7's "known limitation to surface honestly" list): the Console API
 * unreachable, `GATEWAY_UNREACHABLE`, and `BRIDGE_UNREACHABLE` or
 * `GATEWAY_NOT_PAIRED` folded together as one Bridge-side cause.
 */
import { classifyOutage, messageForOutage } from "../api/apiError.js";

export function OutageView({ error }: { error: unknown }) {
  const outage = classifyOutage(error);

  return (
    <div className="outage-view" role="alert" data-outage-kind={outage.kind}>
      <p>{messageForOutage(outage)}</p>
    </div>
  );
}

export function LoadingView() {
  return (
    <p className="loading-view" role="status">
      Loading…
    </p>
  );
}
