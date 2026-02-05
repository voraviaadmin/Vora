// src/theme/ui.ts

/**
 * Walzia_Platform Theme Tokens v1.0 (LOCKED)
 * Option A: warm off-white canvas + opaque elevated cards + subtle inner highlight.
 *
 * Principles:
 * - Light-first, calm, premium
 * - Teal is an accent ONLY (ring, primary CTA, selected states)
 * - No screen-level hex colors: screens/components must use UI tokens
 *
 * Backward compatibility:
 * - Keep existing keys (bg, cardBg, btnBg, textDim, spacing.cardPad, etc.)
 * - Add new keys (canvas, primary, ring, shadows) for new Home + shared components
 */

export const UI = {
  // -------------------------
  // Colors (Option A)
  // -------------------------
  colors: {
    // New (preferred)
    canvas: "#F7F8F6", // warm off-white
    surface: "#FFFFFF",
    surface2: "#F7F2EB",     // subtle secondary surfaces (sections)


    neutral: {
      900: "#111111",
      800: "#1C1C1E",
      700: "#2C2C2E",
      600: "#3A3A3C",
      500: "#6E6E73",
      400: "#8E8E93",
      300: "#C7C7CC",
      200: "#E5E5EA",
      100: "#F2F2F7",
    },

    primary: {
      teal: "#1FA6A5",       // keep teal as accent, not full-screen color
      tealMuted: "#A8E3DD",
    },

    ring: {
      active: "#2FB8AC",
      track: "#E5E5EA",
    },

    // Inner highlight (subtle “Apple polish” without glass)
    innerHighlight: "rgba(255,255,255,0.65)",

    // --- Backward-compatible aliases (existing screens/components rely on these) ---
    bg: "#FBF7F2",           // app background (warm off-white)

    // Cards are now opaque and premium (no translucent glass by default)
    cardBg: "#FFFFFF",
    cardBorder: "#E5E5EA",

    // Text is now dark
    text: "#141210",
    textDim: "#4C4741",
    textMuted: "#6B655D",

    outline: "#E6DED5",      // borders/dividers (soft warm)
    outlineStrong: "#D6CCBF",

    // Buttons (default = secondary feel; primary CTA uses UI.colors.primary.teal)
    btnBg: "#F7F2EB",        // neutral button background (ghost/secondary)
    btnBorder: "#DED6CC",
    btnText: "#141210",

    // Errors (muted, not loud)
    errorBg: "rgba(179, 38, 30, 0.10)",
    errorBorder: "rgba(179, 38, 30, 0.35)",

    // Charts (light-safe)
    chartBg: "#FFFFFF",
    chartBorder: "#E5E5EA",
    chartBar: "#C7C7CC",

    // Deltas (muted)
    deltaUp: "rgba(47, 184, 172, 0.75)",   // teal-tinted up (stays calm)
    deltaDown: "rgba(179, 38, 30, 0.65)",  // muted red down


    successBg: "rgba(47, 184, 172, 0.12)",
    successBorder: "rgba(47, 184, 172, 0.35)",


    

    tipBg: "#FFFFFF",
    status: {
      danger: "#b00020",
    },

    pill: {
      // Light-safe pills (use subtle tints, dark text)
      neutralBg: "#F7F2EB",
      neutralBorder: "#DED6CC",
      neutralText: "#141210",

      goodBg: "rgba(47, 184, 172, 0.14)",
      goodBorder: "rgba(47, 184, 172, 0.35)",

      okBg: "rgba(199, 199, 204, 0.35)",
      okBorder: "rgba(142, 142, 147, 0.40)",

      badBg: "rgba(179, 38, 30, 0.10)",
      badBorder: "rgba(179, 38, 30, 0.30)",
    },


shadow: "#000000",

    modalBackdrop: "rgba(0,0,0,0.35)",
    modalCard: "#FFFFFF",
    modalBorder: "#E5E5EA",
  },

  // -------------------------
  // Spacing (8pt system)
  // -------------------------
  spacing: {
    // Locked Home spec uses 20px global horizontal padding
    page: 20,

    // Keep existing keys but tune to calmer spacing
    cardPad: 14,
    cardPadLg: 20, // new (hero card)
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
    hero: 20, // new (Home hero)
    inner: 12,
    btn: 16,  // modern touch target feel
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
    // keep old keys for compatibility
    h1: 28,
    cardTitle: 18,
    rowTitle: 16,
    kpiValue: 18,
    small: 10,
    scoreBig: 36,
    caption: 12,
    lineHeightMd: 18,

    // new “locked spec” sizes (Home)
    title: 20,
    heroNumber: 48,
    cardTitleSm: 13,
    label: 12,

    chip: 11,          // ✅ required by Chip component
    sectionTitle: 16,  // ✅ used by SectionHeader
  


    xs: 11,
    sm: 12,
    body: 14,
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
    okMin: 65, // align to the new thresholds
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

  // Shadow is centralized (used by Card component)
  shadow: {
    card: { y: 4, blur: 12, opacity: 0.08 },
  },


  weight: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },




} as const;
