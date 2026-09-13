/**
 * Every Light has `on`; there is no Capability flag to check before showing this.
 *
 * Chakra's Switch renders its hidden input as a plain checkbox; the
 * `role="switch"` is added here so it reads as one — to assistive
 * technology, and to the tests and Playwright specs that find it that way.
 *
 * The visible "On"/"Off" beside the switch is the detail page's; a card
 * says the same thing in its own footer, so there it is read by assistive
 * technology only.
 */
import { Switch } from "@chakra-ui/react";

export function OnOffToggle({
  on,
  pendingOn,
  onToggle,
  labelHidden = false,
}: {
  on: boolean;
  pendingOn: boolean | undefined;
  onToggle: (on: boolean) => void;
  labelHidden?: boolean;
}) {
  const shown = pendingOn ?? on;
  const pending = pendingOn !== undefined;

  return (
    <Switch.Root
      className={`on-off${pending ? " pending" : ""}`}
      checked={shown}
      onCheckedChange={({ checked }) => onToggle(checked)}
      colorPalette="blue"
      size={{ base: "lg", md: "md" }}
      gap="10px"
    >
      <Switch.HiddenInput role="switch" />
      <Switch.Control
        boxShadow={pending ? "0 0 0 3px {colors.orange.500/30}" : undefined}
        transition="box-shadow 0.18s"
      >
        <Switch.Thumb />
      </Switch.Control>
      <Switch.Label
        srOnly={labelHidden}
        fontSize="13px"
        fontWeight="600"
        color={pending ? "orange.500" : "gray.700"}
      >
        {shown ? "On" : "Off"}
      </Switch.Label>
    </Switch.Root>
  );
}
