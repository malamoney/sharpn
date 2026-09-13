/**
 * `/lights/:id`: one Light, deep-linkable, with every control its
 * Capabilities allow.
 */
import { Button, Card, Flex, Text } from "@chakra-ui/react";
import { Link as RouterLink, useParams } from "react-router";

import { LightIconTile } from "../components/LightCard.js";
import { LightControls } from "../components/LightControls.js";
import { LoadingView, OutageView } from "../components/OutageView.js";
import { PageHeader } from "../components/PageHeader.js";
import { ChevronLeftIcon } from "../components/icons.js";
import { archetypeLabel } from "../domain/archetypeLabel.js";
import { useLightQuery } from "../queries/lightsQueries.js";

export function LightDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useLightQuery(id ?? "");

  if (id === undefined) {
    return <OutageView error={new Error("no light id in the URL")} />;
  }

  const light = query.data;

  return (
    <>
      <PageHeader
        title={
          <Flex as="span" display="inline-flex" align="center" gap="3">
            {light !== undefined && (
              <LightIconTile archetype={light.archetype} on={light.on} />
            )}
            {light?.name ?? "Light"}
          </Flex>
        }
        subtitle={light !== undefined ? archetypeLabel(light.archetype) : undefined}
      >
        <Button asChild variant="outline" bg="white" h="40px" rounded="8px" fontWeight="600">
          <RouterLink to="/">
            <ChevronLeftIcon boxSize="14px" />
            All lights
          </RouterLink>
        </Button>
      </PageHeader>

      {query.isPending ? (
        <LoadingView />
      ) : query.isError ? (
        <OutageView error={query.error} />
      ) : (
        <Card.Root as="article" maxW="560px" rounded="16px" border="none" shadow="card" bg="white">
          <Card.Body p="6">
            {/* The known limitation issue #7 asks to surface honestly, rather than
                a name field that quietly does nothing when edited: `LightPut`
                carries no `metadata`, so a Light cannot be renamed here. */}
            <Text fontSize="12.5px" color="gray.500">
              Names come from the Bridge and can't be changed here.
            </Text>
            <LightControls light={query.data} dataUpdatedAt={query.dataUpdatedAt} />
          </Card.Body>
        </Card.Root>
      )}
    </>
  );
}
