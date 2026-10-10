import { useId } from "react";
import { MARK, WORDMARK } from "@/lib/brand-paths";

// Logo de Grupos Pequeños: tres personajes (naranja "g", turquesa "p" y verde) que se reúnen.
// Vectorizado del original para poder animarlo. Las animaciones viven en globals.css (clases gp-*)
// y se apagan con "reducir movimiento".

export type LogoAnim = "none" | "idle" | "intro" | "loading";
export type LogoMood = "happy" | "sad";
type Who = "orange" | "teal" | "green";

const [OX, OY] = MARK.head.orange;
const [TX, TY] = MARK.head.teal;
const [GX, GY] = MARK.head.green;
const HEAD: Record<Who, readonly [number, number]> = { orange: [OX, OY], teal: [TX, TY], green: [GX, GY] };

// Una cara: dos ojos y una sonrisa (o una boca triste), relativas al centro de la cabeza.
function Face({ cx, cy, mood }: { cx: number; cy: number; mood: LogoMood }) {
  const smile =
    mood === "happy"
      ? `M${cx - 51} ${cy - 3.5} A51.5 51.5 0 0 0 ${cx + 51} ${cy - 3.5}`
      : `M${cx - 44} ${cy + 40} Q${cx} ${cy + 2} ${cx + 44} ${cy + 40}`;
  return (
    <g className="gp-face">
      <circle className="gp-eye" cx={cx - 25} cy={cy - 36.5} r={15} />
      <circle className="gp-eye" cx={cx + 25} cy={cy - 36.5} r={15} />
      <path className="gp-smile" d={smile} />
    </g>
  );
}

// Cada personaje va en tres capas anidadas para que sus movimientos no se pisen:
// entrada (una vez) > abrazo (al pasar el mouse) > flotación (continua).
function Layers({ who, children }: { who: Who; children: React.ReactNode }) {
  const [cx, cy] = HEAD[who];
  const style = { transformOrigin: `${cx}px ${cy}px` };
  return (
    <g className={`gp-in gp-in-${who}`} style={style}>
      <g className={`gp-hug gp-hug-${who}`} style={style}>
        <g className={`gp-bob gp-bob-${who}`} style={style}>
          {children}
        </g>
      </g>
    </g>
  );
}

function Characters({ uid, mood }: { uid: string; mood: LogoMood }) {
  const cut = MARK.gap * 2;
  return (
    <>
      <defs>
        <path id={`${uid}-o`} d={MARK.orangeBody} />
        <path id={`${uid}-t`} d={MARK.tealBody} />
        {/* El verde queda "recortado" alrededor de los otros dos, también mientras se mueven */}
        <mask id={`${uid}-m`} maskUnits="userSpaceOnUse" x={-80} y={-80} width={MARK.w + 160} height={MARK.h + 160}>
          <rect x={-80} y={-80} width={MARK.w + 160} height={MARK.h + 160} fill="#fff" />
          <Layers who="orange">
            <use href={`#${uid}-o`} fill="#000" stroke="#000" strokeWidth={cut} strokeLinejoin="round" />
          </Layers>
          <Layers who="teal">
            <use href={`#${uid}-t`} fill="#000" stroke="#000" strokeWidth={cut} strokeLinejoin="round" />
          </Layers>
        </mask>
      </defs>

      <g mask={`url(#${uid}-m)`}>
        <Layers who="green">
          <circle cx={GX} cy={GY} r={MARK.r} fill={MARK.colors.green} />
          <Face cx={GX} cy={GY} mood={mood} />
        </Layers>
      </g>
      <Layers who="orange">
        <use href={`#${uid}-o`} fill={MARK.colors.orange} />
        <Face cx={OX} cy={OY} mood={mood} />
      </Layers>
      <Layers who="teal">
        <use href={`#${uid}-t`} fill={MARK.colors.teal} />
        <Face cx={TX} cy={TY} mood={mood} />
      </Layers>
    </>
  );
}

type Variant = "mark" | "stacked" | "horizontal";

/** Color del nombre sobre fondo claro (el del logo original) y dónde se separan las dos palabras */
const WORDMARK_DARK = "#343434";
const WORD_SPLIT = 797;

export function BrandLogo({
  variant = "horizontal",
  tone = "dark",
  anim = "idle",
  mood = "happy",
  className = "",
  label = "Grupos Pequeños",
  ink,
}: {
  variant?: Variant;
  /** Color del nombre: "dark" para fondos claros, "light" para fondos oscuros */
  tone?: "dark" | "light";
  anim?: LogoAnim;
  mood?: LogoMood;
  className?: string;
  label?: string | null;
  /** Color propio del nombre: uno solo, o dos (uno para "grupos" y otro para "pequeños") */
  ink?: string | [string, string];
}) {
  const uid = `gp${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const base = ink ?? (tone === "light" ? "#F5EFE6" : WORDMARK_DARK);
  const duo = Array.isArray(base);
  const textColor = duo ? `url(#${uid}-ink)` : (base as string);
  const pad = 14;

  let viewBox: string;
  let body: React.ReactNode;

  if (variant === "mark") {
    viewBox = `${-pad} ${-pad} ${MARK.w + pad * 2} ${MARK.h + pad * 2}`;
    body = <Characters uid={uid} mood={mood} />;
  } else if (variant === "stacked") {
    const x0 = WORDMARK.dx - pad;
    viewBox = `${x0} ${-pad} ${WORDMARK.w + pad * 2} ${WORDMARK.dy + WORDMARK.h + pad * 2}`;
    body = (
      <>
        <Characters uid={uid} mood={mood} />
        <path d={WORDMARK.d} fill={textColor} transform={`translate(${WORDMARK.dx} ${WORDMARK.dy})`} />
      </>
    );
  } else {
    const s = 1.4;
    const gapX = 78;
    const tx = MARK.w + gapX;
    const ty = (MARK.h - WORDMARK.h * s) / 2 + 22;
    viewBox = `${-pad} ${-pad} ${tx + WORDMARK.w * s + pad * 2} ${MARK.h + pad * 2}`;
    body = (
      <>
        <Characters uid={uid} mood={mood} />
        <path d={WORDMARK.d} fill={textColor} transform={`translate(${tx} ${ty}) scale(${s})`} />
      </>
    );
  }

  return (
    <svg
      viewBox={viewBox}
      className={`gp-logo gp-anim-${anim} ${className}`}
      role={label ? "img" : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {duo && (
        <defs>
          {/* Corte duro en el espacio entre las dos palabras */}
          <linearGradient id={`${uid}-ink`} gradientUnits="userSpaceOnUse" x1={0} x2={WORDMARK.w} y1={0} y2={0}>
            <stop offset={WORD_SPLIT / WORDMARK.w} stopColor={(base as [string, string])[0]} />
            <stop offset={WORD_SPLIT / WORDMARK.w} stopColor={(base as [string, string])[1]} />
          </linearGradient>
        </defs>
      )}
      {body}
    </svg>
  );
}
