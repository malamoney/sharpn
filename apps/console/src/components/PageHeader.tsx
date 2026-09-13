/**
 * The row at the top of every signed-in page: title and a line under it on
 * the left, whatever the page needs (a search box, a back link) in the
 * middle, and the account menu on the right. Pages render it themselves
 * rather than the layout, because the title and its subtitle are the
 * page's to know — the list counts Lights, the detail page names one.
 */
import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

import { AccountMenu } from "./AccountMenu.js";

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Flex as="header" align="center" gap="5" wrap="wrap">
      <Box flex="1" minW="0">
        <Heading
          as="h1"
          fontSize={{ base: "22px", md: "26px" }}
          fontWeight="800"
          letterSpacing="-0.02em"
          lineHeight="1.2"
        >
          {title}
        </Heading>
        {subtitle !== undefined && (
          <Text mt="1" fontSize="13.5px" color="gray.500">
            {subtitle}
          </Text>
        )}
      </Box>
      {children}
      <AccountMenu />
    </Flex>
  );
}
