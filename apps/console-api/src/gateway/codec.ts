/**
 * Protobuf in, Lights out.
 *
 * This is the only file in the project that reads a `LightGet`, and the only
 * one that builds a `LightPut`. Everything above it is given the shapes the
 * contract defines, which is what "protobuf stays inside the adapter" means in
 * practice: a `LightGet` is not a Light — it is bigger, differently spelled,
 * and carries fields whose compatibility this project has not taken on — and
 * the way to keep the two from being confused is for the tier that knows about
 * Lights to have no way to name the other one.
 */
import {
  lightArchetypeToJSON,
  resourceIdentifier_RtypeToJSON,
  type LightArchetype as ReportedArchetype,
  type ResourceIdentifier_Rtype as ReportedRtype,
} from "../gen/hue/v1/common.js";
import { Event_Type } from "../gen/hue/v1/events.js";
import { Gap_Cause, type HueEvent } from "../gen/hue/v1/event_service.js";
import type { LightGet, LightPut } from "../gen/hue/v1/lighting.js";
import type { MutationResponse } from "../gen/hue/v1/lighting_service.js";
import {
  lightArchetypeSchema,
  type Acknowledgement,
  type Light,
  type LightCommand,
  type Outcome,
  type ResourceIdentifier,
} from "../contract/index.js";

/** What the Gateway's enum values all begin with, and Hue's names do not. */
const ARCHETYPE_PREFIX = "LIGHT_ARCHETYPE_";
const RTYPE_PREFIX = "RTYPE_";

/**
 * A Light, as a browser sees one.
 *
 * The Capabilities are field presence and nothing else: a Light reporting no
 * `dimming` cannot be dimmed, and one reporting no `color` is not a Light that
 * is currently black. They are read here rather than guessed further up,
 * because presence is exactly what does not survive being turned into a
 * browser-facing value — `brightness` is absent in both cases.
 */
export function lightFrom(reported: LightGet): Light {
  return {
    id: reported.id,
    name: reported.metadata?.name ?? "",
    archetype: archetypeFrom(reported.metadata?.archetype),
    on: reported.on?.on ?? false,
    brightness: reported.dimming?.brightness,
    colorTemperatureMirek: reported.colorTemperature?.mirek,
    colorXy: reported.color?.xy,
    capabilities: {
      dimming: reported.dimming !== undefined,
      colorTemperature: reported.colorTemperature !== undefined,
      color: reported.color !== undefined,
    },
  };
}

/**
 * The archetype, spelled the way Hue spells it.
 *
 * The Gateway's `codec.py` builds these names by prefixing and upper-casing
 * Hue's own; this undoes that. An archetype these bindings cannot name — a
 * firmware newer than this build, which arrives as ts-proto's `UNRECOGNIZED`
 * — becomes `unspecified`, which is what a browser draws a generic bulb for.
 * It is deliberately not `unknown_archetype`: that is Hue's own value, chosen
 * by whoever set the Light up.
 */
function archetypeFrom(reported: ReportedArchetype | undefined): Light["archetype"] {
  if (reported === undefined) {
    return "unspecified";
  }

  const spelled = lightArchetypeToJSON(reported);
  const hueName = spelled.startsWith(ARCHETYPE_PREFIX)
    ? spelled.slice(ARCHETYPE_PREFIX.length).toLowerCase()
    : spelled;

  return lightArchetypeSchema.catch("unspecified").parse(hueName);
}

/**
 * The `LightPut` for a Command, where presence is the whole contract.
 *
 * A key the Command does not carry leaves the corresponding field unset, and
 * an unset field is absent from the message the Bridge receives — it is not a
 * zero one. The two survive being set: `{on: false}` becomes an `On` that says
 * so, and `{brightness: 0}` a `Dimming` that says so, and both of those
 * encode as a present-but-empty submessage rather than as nothing at all.
 *
 * The colour and the colour temperature are one field here, because the
 * contract models them as a `oneof` and ts-proto was asked for a discriminated
 * union. A Command carrying both cannot be built — it does not typecheck — and
 * cannot be received either, because the schema refuses it first. Both guards
 * are needed; see ADR 0005.
 */
export function commandFor(asked: LightCommand): LightPut {
  return {
    ...(asked.on === undefined ? {} : { on: { on: asked.on } }),
    ...(asked.brightness === undefined
      ? {}
      : { dimming: { brightness: asked.brightness } }),
    colour: colourFor(asked),
  };
}

function colourFor(asked: LightCommand): LightPut["colour"] {
  if (asked.colorXy !== undefined) {
    return { $case: "color", color: { xy: asked.colorXy } };
  }

  if (asked.colorTemperatureMirek !== undefined) {
    return {
      $case: "colorTemperature",
      colorTemperature: { mirek: asked.colorTemperatureMirek },
    };
  }

  return undefined;
}

/**
 * What the Bridge says the Mutation did, which is not what the Light now is.
 *
 * The Resources are identifiers — a `rid` and an `rtype` — and the errors are
 * the Bridge's own prose. Neither is state, and ADR 0001 is why this is not
 * quietly improved into something that carries a Light.
 */
export function acknowledgementFrom(
  response: MutationResponse,
  correlationId: string,
): Acknowledgement {
  const updated = response.updated.map(identifierFrom);
  const errors = response.errors.map((error) => ({
    description: error.description,
  }));

  return {
    outcome: outcomeFrom(updated.length, errors.length, correlationId),
    updated,
    errors,
    correlationId,
  };
}

/**
 * What the two arrays came to.
 *
 * Empty and empty is `unknown`, not `success`. It should be unreachable — the
 * Gateway refuses an empty Command before it sends one — so reaching it means
 * an assumption here is wrong, and success is the one answer that cannot be
 * taken back. It is logged at error level for the same reason: nobody is
 * watching for a 200 that was not quite true.
 */
function outcomeFrom(
  updated: number,
  errors: number,
  correlationId: string,
): Outcome {
  if (updated > 0) {
    return errors > 0 ? "partial" : "success";
  }

  if (errors > 0) {
    return "rejected";
  }

  console.error(
    "the Gateway acknowledged a Mutation with no Resources and no errors; " +
      `the Outcome is unknown (correlationId=${correlationId})`,
  );

  return "unknown";
}

/**
 * A Resource the Bridge named, with its type spelled Hue's way.
 *
 * The type is text rather than an enumeration because the Console only
 * compares it: a Resource type newer than this Gateway arrives as
 * `RTYPE_UNSPECIFIED` with its id intact, and one newer than these bindings as
 * ts-proto's `UNRECOGNIZED`. Both become `unspecified`, and neither becomes an
 * error — the id is still the id.
 */
function identifierFrom(reported: {
  rid: string;
  rtype: ReportedRtype;
}): ResourceIdentifier {
  const spelled = resourceIdentifier_RtypeToJSON(reported.rtype);

  return {
    rid: reported.rid,
    rtype: spelled.startsWith(RTYPE_PREFIX)
      ? spelled.slice(RTYPE_PREFIX.length).toLowerCase()
      : "unspecified",
  };
}

/**
 * Something the Gateway had to tell a Subscriber.
 *
 * A change carries an id and a type and nothing else. The Gateway offers the
 * changed properties — `ResourceChange.update` is a typed `LightGet` — and
 * this is where that offer is declined: only the properties that changed are
 * in it, so it is a change shaped like a Light rather than a Light, and
 * nothing in a type would tell the two apart once it had been passed on. What
 * a change asserts is that a copy may be wrong, and the only thing to do with
 * one is read that Light again (ADR 0002).
 */
export type GatewayEvent =
  | {
      kind: "change";
      change: "added" | "changed" | "removed";
      resource: ResourceIdentifier;
    }
  | {
      kind: "gap";
      cause: "reconnected" | "subscriber_behind" | "unspecified";
      missed: number;
    };

/**
 * What one message on the stream means, or nothing if it means nothing.
 *
 * An event carrying neither a change nor a Gap is one this build cannot read —
 * a `happened` the Gateway added after these bindings were generated. It is
 * dropped rather than guessed at.
 */
export function eventFrom(event: HueEvent): GatewayEvent | undefined {
  if (event.happened?.$case === "change") {
    const { change } = event.happened;

    return {
      kind: "change",
      change: changeFrom(change.type),
      resource: identifierFrom(change.resource ?? { rid: "", rtype: 0 }),
    };
  }

  if (event.happened?.$case === "gap") {
    return {
      kind: "gap",
      cause: causeFrom(event.happened.gap.cause),
      missed: event.happened.gap.missed,
    };
  }

  return undefined;
}

/**
 * Which of the three a Bridge event type is.
 *
 * Anything that is not plainly an addition or a deletion is a change, which is
 * the reading that costs a read and cannot be wrong about what a Light now is.
 * `TYPE_ERROR` is the interesting one: the Bridge reports it about a Resource,
 * and the Resource is exactly what may no longer be what the Console believes.
 */
function changeFrom(type: Event_Type): "added" | "changed" | "removed" {
  switch (type) {
    case Event_Type.TYPE_ADD:
      return "added";
    case Event_Type.TYPE_DELETE:
      return "removed";
    default:
      return "changed";
  }
}

function causeFrom(cause: Gap_Cause): "reconnected" | "subscriber_behind" | "unspecified" {
  switch (cause) {
    case Gap_Cause.CAUSE_RECONNECTED:
      return "reconnected";
    case Gap_Cause.CAUSE_SUBSCRIBER_BEHIND:
      return "subscriber_behind";
    default:
      return "unspecified";
  }
}
