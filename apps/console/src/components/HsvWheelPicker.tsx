/**
 * The fallback for a bulb that reports no gamut of its own — the proto notes
 * some do not. An HSV wheel, assuming Gamut C, rather than the triangle
 * picker: there is no triangle to draw one against.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { ColorXy } from "../api/types.js";
import { hsvToXy } from "../domain/hsvToXy.js";

const SIZE = 200;
const RADIUS = SIZE / 2;

interface Hsv {
  hue: number;
  saturation: number;
}

function hsvFromOffset(dx: number, dy: number): Hsv {
  const saturation = Math.min(1, Math.hypot(dx, dy) / RADIUS);
  const degrees = (Math.atan2(dy, dx) * 180) / Math.PI;
  return { hue: degrees < 0 ? degrees + 360 : degrees, saturation };
}

function cursorPosition({ hue, saturation }: Hsv): { x: number; y: number } {
  const radians = (hue * Math.PI) / 180;
  const r = saturation * RADIUS;
  return { x: RADIUS + r * Math.cos(radians), y: RADIUS + r * Math.sin(radians) };
}

export function HsvWheelPicker({
  onCommit,
}: {
  onCommit: (xy: ColorXy) => void;
}) {
  // `hsvToXy` has no inverse to read a starting hue and saturation back out
  // of a confirmed or Pending xy — xy does not carry them. The cursor starts
  // at the wheel's centre; touching it is what moves it, same as any other
  // control here before a person has interacted with it.
  const [live, setLive] = useState<Hsv>({ hue: 0, saturation: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function hsvFromEvent(event: ReactPointerEvent<HTMLDivElement>): Hsv {
    const element = ref.current;
    if (element === null) {
      return live;
    }
    const rect = element.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * SIZE;
    const py = ((event.clientY - rect.top) / rect.height) * SIZE;
    return hsvFromOffset(px - RADIUS, py - RADIUS);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setLive(hsvFromEvent(event));
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragging.current) {
      return;
    }
    setLive(hsvFromEvent(event));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragging.current) {
      return;
    }
    dragging.current = false;
    const hsv = hsvFromEvent(event);
    setLive(hsv);
    onCommit(hsvToXy(hsv.hue, hsv.saturation));
  }

  const cursor = cursorPosition(live);

  return (
    <div
      ref={ref}
      className="hsv-wheel"
      role="slider"
      aria-label="Colour"
      aria-valuetext={`hue ${Math.round(live.hue)}, saturation ${Math.round(live.saturation * 100)}%`}
      style={{ width: SIZE, height: SIZE, touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        className="hsv-wheel-cursor"
        style={{ left: cursor.x, top: cursor.y }}
      />
    </div>
  );
}
