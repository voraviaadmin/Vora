// src/theme/ui.ts

/**
 * Walzia_Platform Theme Tokens v1.2 (DARK + PASTEL)
 *
 * Locked direction:
 * - One shared warm-dark canvas across all tabs (premium, low glare)
 * - Each tab uses ONE soothing pastel accent
 * - Prefer tinted surfaces/borders over fully colored blocks
 * - Logs are mostly neutral; color only for meaning
 * - Zero-patience UX: high contrast, obvious CTAs, no clutter
 *
 * Accent mapping (keep key names for backward compatibility):
 * - UI.colors.primary.teal   -> HOME accent (Cool Sky Blue)
 * - UI.colors.primary.pink   -> SCAN accent (Soft Peach)
 * - UI.colors.primary.apricot-> EAT OUT accent (Apricot)
 * - UI.colors.primary.cyan   -> GROUPS accent (Mint)
 * - Profile stays mostly neutral; use toggles with teal or current tab accent
 *
 * Home-only highlight cards:
 * - UI.colors.homeCards.focus*   -> Today Focus (blue tint)
 * - UI.colors.homeCards.suggest* -> Suggestions (lighter blue tint)
 *
 * Ring tokens (Home):
 * - UI.colors.ring.active / track / glow
 *
 * AI confidence pill (global, calm/neutral):
 * - UI.colors.ai.pill*
 */

export const UI = {
  // -------------------------
  // Colors (Warm dark baseline + soothing pastels)
  // -------------------------
  colors: {
    // New (preferred)
    canvas: "#111827", // app canvas background (warm dark navy-charcoal)
    surface: "#1F2937", // primary card surface (graphite)
    surface2: "#2A364A", // secondary surface (sections, subtle panels)

    // Neutral ramp tuned for warm-dark UI
    neutral: {
      900: "#0B1020",
      850: "#111827",
      800: "#1F2937",
      700: "#273449",
      600: "#334155",
      500: "#3A475C",
      400: "#64748B",
      300: "#94A3B8",
      200: "#CBD5E1",
      100: "#F1F5F9",
    },

    /**
     * Accent family
     * NOTE: We keep the key name `.teal` for compatibility,
     * but it now represents the *primary accent* (Home cool blue).
     *
     * Screen-level selection:
     * - Home uses `.teal`
     * - Scan uses `.pink` (now peach)
     * - Eat Out uses `.apricot`
     * - Groups uses `.cyan` (now mint)
     */
    primary: {
      teal: "#6FAED9", // HOME accent (Cool Sky Blue)
      tealMuted: "#9BC7E6", // softer/lighter blue for subtle states

      // Extra accents (optional)
      violet: "#6FAED9", // alias to primary (keep key)
      pink: "#F2B6A0", // SCAN accent (Soft Peach) - intentionally not "pink" in look
      cyan: "#8FD3B8", // GROUPS accent (Mint) - intentionally not "cyan" in look

      // Added (safe additive) for Eat Out
      apricot: "#F3C78A", // EAT OUT accent (Apricot / warm golden pastel)
    },

    // Ring tokens (score ring + glow) - Home-focused
    ring: {
      active: "#6FAED9", // ring stroke
      track: "#334155", // ring track on dark
      glow: "rgba(111, 174, 217, 0.35)", // soft outer glow halo (premium, not loud)
    },

    // Inner highlight (subtle “polish”)
    innerHighlight: "rgba(255,255,255,0.05)",

    // --- Backward-compatible aliases (existing screens/components rely on these) ---
    bg: "#111827", // app background

    // Cards
    cardBg: "#1F2937",
    cardBorder: "#3A475C",

    // Text (light on dark)
    text: "#F8FAFC",
    textDim: "#D1D5DB",
    textMuted: "#9CA3AF",

    // Lines/borders
    outline: "#3A475C",
    outlineStrong: "#4B5563",

    // Buttons
    // - Primary CTA should use UI.colors.primary.<accent> per screen (teal/peach/apricot/mint)
    // - Secondary/ghost uses these neutrals
    btnBg: "#273449", // secondary button bg (“light grey” feel on dark)
    btnBorder: "#4B5563",
    btnText: "#F8FAFC",

    // Errors (quiet but clear)
    errorBg: "rgba(255, 82, 82, 0.12)",
    errorBorder: "rgba(255, 82, 82, 0.35)",

    // Charts (dark-safe)
    chartBg: "#1F2937",
    chartBorder: "#3A475C",
    chartBar: "#4B5563",

    // Deltas (Logs: mostly neutral; use color only for meaning)
    deltaUp: "rgba(111, 174, 217, 0.75)", // blue up
    deltaDown: "rgba(255, 82, 82, 0.70)", // muted red down

    // Success (mint tint)
    successBg: "rgba(143, 211, 184, 0.12)",
    successBorder: "rgba(143, 211, 184, 0.26)",

    tipBg: "#1F2937",
    status: {
      danger: "#FF5252",
    },

    // Pills / chips (dark-safe, calm)
    pill: {
      neutralBg: "#273449",
      neutralBorder: "#4B5563",
      neutralText: "#F8FAFC",

      // Good = mint
      goodBg: "rgba(143, 211, 184, 0.14)",
      goodBorder: "rgba(143, 211, 184, 0.28)",

      // OK = apricot (gentle caution/neutral-positive)
      okBg: "rgba(243, 199, 138, 0.14)",
      okBorder: "rgba(243, 199, 138, 0.28)",

      // Bad = red (reserved for true errors)
      badBg: "rgba(255, 82, 82, 0.12)",
      badBorder: "rgba(255, 82, 82, 0.30)",
    },

    // Home-specific vibrant-but-light cards (blue tints only, premium not loud)
    // Use these ONLY on Home for Today Focus + Suggestions.
    homeCards: {
      // Today Focus: cool blue tint (slightly stronger)
      focusBg: "rgba(111, 174, 217, 0.14)",
      focusBorder: "rgba(111, 174, 217, 0.28)",
      focusChipBg: "rgba(111, 174, 217, 0.16)",
      focusChipBorder: "rgba(111, 174, 217, 0.32)",

      // Suggestions: lighter blue tint (keeps Home cohesive and calm)
      suggestBg: "rgba(111, 174, 217, 0.10)",
      suggestBorder: "rgba(111, 174, 217, 0.22)",

      // Optional badge: mint tint (small badges only)
      badgeBg: "rgba(143, 211, 184, 0.12)",
      badgeBorder: "rgba(143, 211, 184, 0.24)",
    },

    // AI Confidence pill tokens (standard look everywhere: calm, neutral, readable)
    ai: {
      pillBg: "rgba(191, 199, 213, 0.16)", // silver tint
      pillBorder: "rgba(191, 199, 213, 0.28)",
      pillText: "#F8FAFC",
    },

    // Shadows / overlays
    shadow: "#000000",

    modalBackdrop: "rgba(0,0,0,0.55)",
    modalCard: "#1F2937",
    modalBorder: "#3A475C",
  },

  // -------------------------
  // Spacing (8pt system)
  // -------------------------
  spacing: {
    page: 20,

    cardPad: 14,
    cardPadLg: 20,
    sectionGap: 12,

    gap: 10,
    gapSm: 8,
    gapXs: 6,

    btnY: 12,
    btnX: 14,

    pillY: 6,
    pillX: 10,

    cardPadding: 10,
    textGapSm: 4,
    sectionGapSm: 6,
    tipPadding: 10,

    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },

  // -------------------------
  // Radius
  // -------------------------
  radius: {
    card: 16,
    hero: 20,
    inner: 12,
    btn: 16,
    pill: 999,

    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
  },

  border: {
    thin: 1,
  },

  // -------------------------
  // Typography
  // -------------------------
  type: {
    h1: 28,
    cardTitle: 18,
    rowTitle: 16,
    kpiValue: 18,
    small: 10,
    scoreBig: 36,
    caption: 12,
    lineHeightMd: 18,

    title: 20,
    heroNumber: 48,
    cardTitleSm: 13,
    label: 12,

    md: 15,
    lg: 17,
    xl: 20,

    button: 14,
    section: 13,
  },

  limits: { scoringReasonsMax: 6 },
  opacity: { reason: 0.95 },

  scoring: {
    goodMin: 80,
    okMin: 65,
  },

  trend: {
    barMinH: 6,
    barMaxH: 40,
    barW: 14,
    barColW: 20,
  },

  motion: {
    fast: 160,
    deltaTranslateY: 4,
    ringMs: 600,
  },

  sizes: {
    textAreaMinH: 110,
    cameraH: 300,
    buttonH: 56,
    chipH: 28,
    ringSize: 180,
    ringStroke: 12,
  },

  shadow: {
    card: { y: 6, blur: 16, opacity: 0.22 },
  },

  weight: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
} as const;
