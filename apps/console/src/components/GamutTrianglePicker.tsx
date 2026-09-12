/**
 * A 2D picker operating directly in xy, over the triangle this Light's own
 * `colorGamut` reports. Every point inside it is a colour the bulb can
 * actually produce; `clampToGamut` is what a drag that leaves the triangle
 * is caught by, rather than a clamp happening on the Bridge and coming back
 * a different colour than the one touched.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { ColorGamut, ColorXy } from "../api/types.js";
import { clampToGamut } from "../domain/gamutTriangle.js";

const SIZE = 200;

function toScreen({ x, y }: ColorXy): { x: number; y: number } {
  // CIE y increases upward; SVG y increases downward.
  return { x: x * SIZE, y: (1 - y) * SIZE };
}

export function GamutTrianglePicker({
  gamut,
  value,
  onCommit,
}: {
  gamut: ColorGamut;
  value: ColorXy;
  onCommit: (xy: ColorXy) => void;
}) {
  const [live, setLive] = useState(value);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    setLive(value);
  }, [value.x, value.y]);

  function pointFromEvent(event: ReactPointerEvent<SVGSVGElement>): ColorXy {
    const svg = svgRef.current;
    if (svg === null) {
      return live;
    }
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * SIZE;
    const py = ((event.clientY - rect.top) / rect.height) * SIZE;
    return clampToGamut(
      { x: px / SIZE, y: 1 - py / SIZE },
      gamut,
    );
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>): void {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setLive(pointFromEvent(event));
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>): void {
    if (!dragging.current) {
      return;
    }
    setLive(pointFromEvent(event));
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>): void {
    if (!dragging.current) {
      return;
    }
    dragging.current = false;
    onCommit(pointFromEvent(event));
  }

  const red = toScreen(gamut.red);
  const green = toScreen(gamut.green);
  const blue = toScreen(gamut.blue);
  const cursor = toScreen(live);

  // Three vertex-anchored radial gradients, screen-blended: an approximation
  // of a triangular colour gradient without a mesh-gradient element, which
  // is not reliably supported. Each corner's role — red, green, blue — is
  // the Light's own primaries, so tinting each corner that colour is
  // accurate regardless of exactly where in xy that corner sits.
  const background = `
    radial-gradient(circle at ${red.x}px ${red.y}px, #ff2b1f, transparent 70%),
    radial-gradient(circle at ${green.x}px ${green.y}px, #22e022, transparent 70%),
    radial-gradient(circle at ${blue.x}px ${blue.y}px, #2f5bff, transparent 70%),
    #0c0c0c
  `;

  return (
    <svg
      ref={svgRef}
      className="gamut-picker"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={SIZE}
      height={SIZE}
      role="slider"
      aria-label="Colour"
      aria-valuetext={`xy ${live.x.toFixed(3)}, ${live.y.toFixed(3)}`}
      style={{ background, backgroundBlendMode: "screen", touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <polygon
        points={`${red.x},${red.y} ${green.x},${green.y} ${blue.x},${blue.y}`}
        className="gamut-triangle"
      />
      <circle cx={cursor.x} cy={cursor.y} r={7} className="gamut-cursor" />
    </svg>
  );
}
