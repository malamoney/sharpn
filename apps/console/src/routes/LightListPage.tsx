/**
 * `/`: every Light, sorted locale-aware by name — `ListLights` returns no
 * defined order, so the list must not reshuffle on refetch (`sortLights.ts`
 * is where that is guaranteed).
 *
 * The search box narrows the grid by name in the browser alone; it sends
 * nothing and reads nothing new, so a filtered grid is exactly as current as
 * the unfiltered one.
 */
import { SimpleGrid, Text } from "@chakra-ui/react";
import { useState } from "react";

import { LightCard } from "../components/LightCard.js";
import { LoadingView, OutageView } from "../components/OutageView.js";
import { PageHeader } from "../components/PageHeader.js";
import { SearchBox } from "../components/SearchBox.js";
import { sortLightsByName } from "../domain/sortLights.js";
import { useLightsQuery } from "../queries/lightsQueries.js";

export function LightListPage() {
  const query = useLightsQuery();
  const [search, setSearch] = useState("");

  const lights = query.data ?? [];
  const lit = lights.filter((light) => light.on).length;
  const subtitle = query.isPending
    ? "Reading the Bridge…"
    : query.isError
      ? "The Bridge could not be read"
      : lights.length === 0
        ? "Nothing paired to the Bridge"
        : `${lights.length} ${lights.length === 1 ? "light" : "lights"} paired · ${lit} on`;

  return (
    <>
      <PageHeader title="Lights" subtitle={subtitle}>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search lights"
          disabled={!query.isSuccess || lights.length === 0}
        />
      </PageHeader>
      <LightGrid query={query} search={search} />
    </>
  );
}

function LightGrid({
  query,
  search,
}: {
  query: ReturnType<typeof useLightsQuery>;
  search: string;
}) {
  if (query.isPending) {
    return <LoadingView />;
  }

  if (query.isError) {
    return <OutageView error={query.error} />;
  }

  if (query.data.length === 0) {
    return (
      <Text role="status" color="gray.500">
        The Bridge reports no lights.
      </Text>
    );
  }

  const needle = search.trim().toLocaleLowerCase();
  const shown = sortLightsByName(query.data).filter(
    (light) => needle === "" || light.name.toLocaleLowerCase().includes(needle),
  );

  if (shown.length === 0) {
    return <Text color="gray.500">Nothing named like “{search.trim()}”.</Text>;
  }

  return (
    <SimpleGrid
      as="ul"
      listStyleType="none"
      m="0"
      p="0"
      minChildWidth="200px"
      gap={{ base: "14px", md: "5" }}
    >
      {shown.map((light) => (
        <LightCard
          key={light.id}
          light={light}
          listDataUpdatedAt={query.dataUpdatedAt}
        />
      ))}
    </SimpleGrid>
  );
}
