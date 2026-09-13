/**
 * The handful of glyphs the shell needs, drawn inline on Chakra's `Icon`
 * rather than pulled from an icon package — six shapes do not justify a
 * dependency. `ArchetypeIcon` is separate: it is a Light's, not the shell's.
 */
import { Icon, type IconProps } from "@chakra-ui/react";

function Glyph({ children, ...props }: IconProps) {
  return (
    <Icon
      as="svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </Icon>
  );
}

export function BulbIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2z" />
    </Glyph>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Glyph strokeWidth="2.2" {...props}>
      <path d="M15 18l-6-6 6-6" />
    </Glyph>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Glyph strokeWidth="2.2" {...props}>
      <path d="M6 9l6 6 6-6" />
    </Glyph>
  );
}

export function PersonIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M4.6 20a7.6 7.6 0 0 1 14.8 0" />
    </Glyph>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M15 17l5-5-5-5" />
      <path d="M20 12H9" />
      <path d="M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6" />
    </Glyph>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Glyph strokeWidth="2" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </Glyph>
  );
}
