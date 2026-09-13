/**
 * `loading` and `failed`, and `failed`'s three distinguishable causes
 * (issue #7's "known limitation to surface honestly" list): the Console API
 * unreachable, `GATEWAY_UNREACHABLE`, and `BRIDGE_UNREACHABLE` or
 * `GATEWAY_NOT_PAIRED` folded together as one Bridge-side cause.
 */
import { Alert, Text } from "@chakra-ui/react";

import { classifyOutage, messageForOutage } from "../api/apiError.js";

export function OutageView({ error }: { error: unknown }) {
  const outage = classifyOutage(error);

  return (
    <Alert.Root
      status="error"
      variant="subtle"
      role="alert"
      rounded="16px"
      data-outage-kind={outage.kind}
    >
      <Alert.Indicator />
      <Alert.Description>{messageForOutage(outage)}</Alert.Description>
    </Alert.Root>
  );
}

export function LoadingView() {
  return (
    <Text role="status" color="gray.500">
      Loading…
    </Text>
  );
}
