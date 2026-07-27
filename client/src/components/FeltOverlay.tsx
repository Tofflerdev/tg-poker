import React, { ReactNode } from "react";

/**
 * A movable overlay on the felt (dealer button, bet stack, payout stack).
 *
 * iOS WebKit smears a trail across the table when an overlay animates its
 * `left`/`top` over the felt's radial gradient: every frame relayouts the
 * element and the gradient underneath it is not reliably invalidated, so the
 * old frames stay painted. Moving via a `transform` on a promoted layer keeps
 * the whole animation on the compositor — nothing behind the overlay is
 * repainted, so nothing can be left behind.
 *
 * The positioning layer fills the table container, which makes its translate
 * percentages percentages of the *container* — the coordinate space seatLayout
 * already speaks. The (invisible, empty) part of the layer that hangs outside
 * the container is clipped by GameRoom's overflow-hidden wrappers.
 */
interface FeltOverlayProps {
  /** Target position: % of the table container, i.e. seatLayout coordinates. */
  left: number;
  top: number;
  /** How the content sits on that point. Default: centred on it. */
  align?: string;
  /** Transition for the move itself, e.g. `transform 700ms ease-in-out`. */
  transition?: string;
  /** Transition for the content's own transform (scale on collect). */
  contentTransition?: string;
  opacity?: number;
  zIndex?: number;
  children: ReactNode;
}

const FeltOverlay: React.FC<FeltOverlayProps> = ({
  left,
  top,
  align = "translate(-50%, -50%)",
  transition = "none",
  contentTransition = "none",
  opacity = 1,
  zIndex = 15,
  children,
}) => (
  <div
    className="absolute inset-0 pointer-events-none"
    style={{
      transform: `translate3d(${left}%, ${top}%, 0)`,
      transition,
      opacity,
      zIndex,
      willChange: "transform, opacity",
      backfaceVisibility: "hidden",
    }}
  >
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform: align,
        transition: contentTransition,
      }}
    >
      {children}
    </div>
  </div>
);

export default FeltOverlay;
