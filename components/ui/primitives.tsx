import type { ComponentPropsWithoutRef, ReactNode } from "react";

/* ============================================================================
   Shared primitives for the member/auth surface, ported from
   prototype/css/device.css. The prototype rendered these inside a 402x874
   device frame on a design board; here they fill a real phone viewport and
   centre on desktop.
   ========================================================================= */

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ── screen shell ─────────────────────────────────────────────────────────── */

export function Screen({
  children,
  className,
  center = false,
  tabBar = false,
}: {
  children: ReactNode;
  className?: string;
  /** Vertically centre the content — splash and confirmation screens. */
  center?: boolean;
  /**
   * This screen renders a MemberTabBar, so reserve room for it.
   *
   * Pages used to do this themselves with `pb-32`, which was wrong twice
   * over. It is a guess at a number that changes per device — 128px against
   * a bar that is 72px plus a 34px home indicator plus the FAB's 28px
   * overhang — and, being a second padding-bottom utility, whether it beat
   * the default below came down to the order Tailwind happened to emit them
   * in, not the order they were written. Content disappeared under the bar.
   */
  tabBar?: boolean;
}) {
  return (
    <div className="surface-app min-h-dvh w-full">
      <div
        className={cx(
          "mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-6",
          /* Clears the notch. Adding to the inset rather than taking the
             larger of the two: on an iPhone 14 Pro the inset is 59px, so
             max(56px, 59px) left the first line flush against the Dynamic
             Island with no breathing room at all. */
          "pt-[max(3.5rem,calc(env(safe-area-inset-top,0px)+1rem))]",
          /* Only when there is no tab bar, so a page can still add its own
             bottom room with a pb-* class. With a tab bar the inline style
             below takes over and deliberately cannot be overridden. */
          !tabBar && "pb-[max(2.5rem,calc(env(safe-area-inset-bottom,0px)+1rem))]",
          center && "items-center justify-center text-center",
          className,
        )}
        /* Inline, so the tab-bar clearance always wins over a stray pb-* in
           className rather than depending on the order Tailwind emitted them. */
        style={tabBar ? { paddingBottom: "var(--tabbar-clearance)" } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

/* ── type ─────────────────────────────────────────────────────────────────── */

export function Title({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cx("text-[30px] leading-[1.12]", className)}>{children}</h1>;
}

export function Sub({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("mt-2 text-[13.5px] leading-relaxed", className)}
       style={{ color: "var(--app-ink-55)" }}>
      {children}
    </p>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] tracking-[0.08em] text-app-good uppercase">{children}</p>
  );
}

export function Hint({ children, tone = "muted" }: {
  children: ReactNode;
  tone?: "muted" | "good" | "accent";
}) {
  const color =
    tone === "good" ? "var(--color-app-good)"
    : tone === "accent" ? "var(--color-app-accent)"
    : "var(--app-ink-45)";
  return <p className="mt-2 text-[12px]" style={{ color }}>{children}</p>;
}

/* ── controls ─────────────────────────────────────────────────────────────── */

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  /** Pins the button to the bottom of the screen. */
  pinned?: boolean;
  loading?: boolean;
};

export function Cta({
  children, className, pinned, loading, disabled, ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "w-full rounded-pill bg-app-accent px-4 py-4 text-[16px] font-bold tracking-[-0.02em]",
        "text-app-accent-ink transition-opacity",
        "hover:opacity-90 active:opacity-80",
        "disabled:cursor-not-allowed disabled:opacity-40",
        pinned && "mt-auto",
        className,
      )}
    >
      {loading ? "…" : children}
    </button>
  );
}

export function GhostLink({
  children, className, ...rest
}: ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "text-[12.5px] font-semibold text-app-accent hover:underline",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ── inputs ───────────────────────────────────────────────────────────────── */

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="mb-[7px] block text-[11.5px]" style={{ color: "var(--app-ink-50)" }}>
      {children}
    </span>
  );
}

type InputProps = ComponentPropsWithoutRef<"input"> & { prefix?: ReactNode };

/** Pill input matching the prototype. `prefix` renders the +91 dial code with
 *  a hairline divider, as on S-02. */
export function PillInput({ prefix, className, ...rest }: InputProps) {
  return (
    <div
      className="flex items-center gap-[10px] rounded-pill px-5 py-[15px]"
      style={{
        background: "var(--color-app-surface)",
        border: "1px solid var(--app-border)",
      }}
    >
      {prefix && (
        <>
          <span className="text-[15px]" style={{ color: "var(--app-ink-60)" }}>
            {prefix}
          </span>
          <span className="h-[18px] w-px" style={{ background: "rgb(249 244 237 / 0.15)" }} />
        </>
      )}
      <input
        {...rest}
        className={cx(
          "min-w-0 flex-1 bg-transparent text-[16px] tracking-[0.02em]",
          "text-app-ink outline-none placeholder:text-[var(--app-ink-40)]",
          className,
        )}
      />
    </div>
  );
}

/* ── segmented control ────────────────────────────────────────────────────── */

export function Segmented<T extends string>({
  options, value, onChange, className,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cx("flex gap-1 rounded-pill p-1", className)}
      style={{ background: "var(--color-app-surface)" }}
    >
      {options.map((opt) => {
        const on = opt === value;
        return (
          <button
            key={opt}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(opt)}
            className={cx(
              "flex-1 rounded-pill py-[10px] text-[13px] font-semibold transition-colors",
              on ? "bg-app-accent text-app-accent-ink" : "hover:text-app-ink",
            )}
            style={on ? undefined : { color: "var(--app-ink-60)" }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

/* ── feedback ─────────────────────────────────────────────────────────────── */

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="mt-3 rounded-md px-4 py-3 text-[12.5px] leading-snug"
      style={{
        background: "rgb(246 160 107 / 0.12)",
        color: "var(--color-app-accent)",
      }}
    >
      {children}
    </p>
  );
}

/* ── brand ────────────────────────────────────────────────────────────────── */

export function Logo({ size = 52 }: { size?: number }) {
  return (
    <div
      className="grid place-items-center rounded-pill bg-app-accent"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        width={size * 0.46} height={size * 0.46} viewBox="0 0 24 24"
        fill="none" stroke="var(--color-app-accent-ink)"
        strokeWidth="2.75" strokeLinecap="round"
      >
        <path d="M6.5 6.5v11M17.5 6.5v11M4 9v6M20 9v6M6.5 12h11" />
      </svg>
    </div>
  );
}

export function Dots({ count, active }: { count: number; active: number }) {
  return (
    <div className="flex gap-[7px]">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="h-[7px] rounded-pill transition-all"
          style={{
            width: i === active ? 20 : 7,
            background: i === active
              ? "var(--color-app-accent)"
              : "rgb(249 244 237 / 0.25)",
          }}
        />
      ))}
    </div>
  );
}
