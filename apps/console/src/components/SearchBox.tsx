import { Input, InputGroup } from "@chakra-ui/react";

import { SearchIcon } from "./icons.js";

export function SearchBox({
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <InputGroup
      w={{ base: "100%", md: "280px" }}
      order={{ base: 3, md: "initial" }}
      startElement={<SearchIcon boxSize="16px" color="gray.400" />}
    >
      <Input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        autoComplete="off"
        onChange={(event) => onChange(event.currentTarget.value)}
        h="40px"
        bg="white"
        rounded="8px"
        fontSize="13.5px"
        borderColor="gray.200"
      />
    </InputGroup>
  );
}
