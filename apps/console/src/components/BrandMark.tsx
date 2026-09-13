/** The blue bulb tile that stands for the Console in the sidebar and on the login page. */
import { Center } from "@chakra-ui/react";

import { BulbIcon } from "./icons.js";

export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <Center
      flex="none"
      w={`${size}px`}
      h={`${size}px`}
      rounded={`${Math.round(size * 0.28)}px`}
      bg="blue.500"
      color="white"
      aria-hidden="true"
    >
      <BulbIcon boxSize={`${Math.round(size * 0.53)}px`} strokeWidth="2" />
    </Center>
  );
}
