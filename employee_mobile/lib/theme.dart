// BVN Package — mobile design system.
//
// One brand language shared with the Admin Codex console: quiet navy, white
// surfaces and one purposeful accent. Status colours are reserved for status,
// not decoration, so the next attendance action stays obvious.
//
// Import this everywhere instead of hard-coding colours so the whole app stays
// on one system.
import 'package:flutter/material.dart';

// ── Brand palette ──────────────────────────────────────────────────────────
/// Primary brand green (matches the console `#259b24`).
const kBrand = Color(0xFF1E3A5F);

/// Deep brand green for gradients, headers and emphasis (console `#1f7c33`).
const kBrandDeep = Color(0xFF152C47);

/// Darkest green for the foot of hero gradients.
const kBrandDarker = Color(0xFF0B1B2D);

/// Soft green wash for active pills, chips and tinted icon tiles.
const kBrandSoft = Color(0xFFE9EEF5);

/// Slightly deeper green ink for text on soft-green surfaces.
const kBrandInk = Color(0xFF1E3A5F);

// ── Neutrals ───────────────────────────────────────────────────────────────
/// Primary text — a deep green-slate that reads calm against white.
const kInk = Color(0xFF0F172A);

/// Secondary text. This remains clearly readable on a phone outdoors; use it
/// for supporting information, never for disabled or decorative content.
const kMuted = Color(0xFF475569);

/// App canvas. A plain white canvas keeps attendance data calm and avoids the
/// layered-card look that made operational screens visually noisy.
const kCanvas = Colors.white;

/// Hairline borders on cards and inputs.
const kHair = Color(0xFFDCE4EE);

// ── Semantic ───────────────────────────────────────────────────────────────
/// Attention / late / pending.
const kAmber = Color(0xFFE59313);
const kAmberInk = Color(0xFF8A5A05);
const kAmberSoft = Color(0xFFFBE9C6);

/// Checked-out / danger.
const kDanger = Color(0xFFC23636);
const kDangerSoft = Color(0xFFFBE0E0);

/// Informational (leave, counts).
const kInfo = Color(0xFF2F6BE0);
const kInfoSoft = Color(0xFFE4EDFF);

// ── Shape & elevation ────────────────────────────────────────────────────────
const double kRadius = 16;
const double kRadiusSm = 12;

/// Solid signature surface. Existing widgets use a [Gradient] decoration, but
/// there is deliberately no hue transition.
const kHeroGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [kBrandDeep, kBrandDeep],
);

/// A deeper variant used behind content that needs more contrast.
const kHeroGradientDeep = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [kBrandDarker, kBrandDarker],
);

/// Surfaces separate with hairlines, not floating shadows.
List<BoxShadow> get kSoftShadow => const [];

/// A slightly stronger shadow for the hero / floating action surfaces.
List<BoxShadow> get kHeroShadow => const [];

ThemeData bvnTheme(Brightness brightness) {
  final scheme = ColorScheme.fromSeed(
    seedColor: kBrand,
    brightness: brightness,
    primary: kBrand,
    secondary: kBrandDeep,
    surface: Colors.white,
    onSurface: kInk,
  ).copyWith(
    onSurfaceVariant: kMuted,
    outline: const Color(0xFF94A3B8),
    outlineVariant: kHair,
  );
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    visualDensity: VisualDensity.standard,
  );
  return base.copyWith(
    scaffoldBackgroundColor: kCanvas,
    splashFactory: InkSparkle.splashFactory,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: kInk,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      surfaceTintColor: Colors.transparent,
      shadowColor: Color(0x14000000),
      titleTextStyle: TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w700,
        color: kInk,
      ),
      toolbarHeight: 56,
    ),
    textTheme: base.textTheme.copyWith(
      bodyLarge: base.textTheme.bodyLarge?.copyWith(
        color: kInk,
        fontSize: 16,
        height: 1.35,
      ),
      bodyMedium: base.textTheme.bodyMedium?.copyWith(
        color: kInk,
        fontSize: 14,
        height: 1.35,
      ),
      bodySmall: base.textTheme.bodySmall?.copyWith(
        color: kMuted,
        fontSize: 12.5,
        height: 1.3,
      ),
      titleMedium: base.textTheme.titleMedium?.copyWith(
        color: kInk,
        fontSize: 17,
        fontWeight: FontWeight.w700,
      ),
      titleSmall: base.textTheme.titleSmall?.copyWith(
        color: kInk,
        fontSize: 14,
        fontWeight: FontWeight.w700,
      ),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shadowColor: const Color(0x141B3A24),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(kRadius),
        side: const BorderSide(color: kHair),
      ),
    ),
    dividerTheme: const DividerThemeData(color: kHair, thickness: 1, space: 1),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: const Color(0xFFF8FAFC),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
      labelStyle: const TextStyle(color: kMuted, fontSize: 14),
      floatingLabelStyle: const TextStyle(
        color: kBrandDeep,
        fontWeight: FontWeight.w600,
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(kRadiusSm),
        borderSide: const BorderSide(color: kHair),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(kRadiusSm),
        borderSide: const BorderSide(color: kHair),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(kRadiusSm),
        borderSide: const BorderSide(color: kBrand, width: 1.6),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: kBrand,
        foregroundColor: Colors.white,
        disabledBackgroundColor: const Color(0xFFCBD5E1),
        disabledForegroundColor: Colors.white,
        minimumSize: const Size(0, 50),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(kRadiusSm),
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: kBrandDeep,
        side: const BorderSide(color: Color(0xFFCBD5E1)),
        minimumSize: const Size(0, 48),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(kRadiusSm),
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: kBrandDeep,
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
      ),
    ),
    chipTheme: const ChipThemeData(
      backgroundColor: Color(0xFFF1F5F9),
      selectedColor: kBrand,
      side: BorderSide(color: kHair),
      labelStyle: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(
        backgroundColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? kBrand : Colors.white,
        ),
        foregroundColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? Colors.white : kInk,
        ),
        side: WidgetStateProperty.all(const BorderSide(color: kHair)),
        textStyle: WidgetStateProperty.all(
          const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
        ),
        shape: WidgetStateProperty.all(
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(kRadiusSm)),
        ),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: kInk,
      contentTextStyle: const TextStyle(color: Colors.white, fontSize: 13.5),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(kRadiusSm),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(kRadius)),
      titleTextStyle: const TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: kInk,
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      elevation: 0,
      height: 66,
      surfaceTintColor: Colors.transparent,
      indicatorColor: kBrandSoft,
      indicatorShape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(
          size: 24,
          color: s.contains(WidgetState.selected) ? kBrandDeep : kMuted,
        ),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w600,
          color: s.contains(WidgetState.selected) ? kBrandDeep : kMuted,
        ),
      ),
    ),
  );
}

// ── Shared building blocks ───────────────────────────────────────────────────

/// A raised white card with the brand's resting soft shadow + hairline.
/// Prefer this over a bare [Card] so every surface lifts off the canvas the
/// same way.
class SoftCard extends StatelessWidget {
  const SoftCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.color = Colors.white,
    this.radius = kRadius,
  });
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color color;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final body = Container(
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: kHair),
        boxShadow: kSoftShadow,
      ),
      // ListTile and other tappable children need a Material immediately
      // beneath their ink response; the card's decorated container otherwise
      // hides the splash and triggers Flutter's debug assertion.
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(radius),
        child: Padding(padding: padding, child: child),
      ),
    );
    if (onTap == null) return body;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(radius),
        child: body,
      ),
    );
  }
}

/// Small uppercase-free section label used above groups of content.
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10, left: 2),
    child: Row(
      children: [
        Container(
          width: 3,
          height: 15,
          margin: const EdgeInsets.only(right: 8),
          decoration: BoxDecoration(
            color: kBrand,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        Text(
          text,
          style: const TextStyle(
            fontSize: 13.5,
            fontWeight: FontWeight.w700,
            color: kInk,
            letterSpacing: .1,
          ),
        ),
        if (trailing != null) ...[const Spacer(), trailing!],
      ],
    ),
  );
}

/// A rounded status pill (approved / late / pending etc.).
class StatusPill extends StatelessWidget {
  const StatusPill({
    super.key,
    required this.label,
    required this.bg,
    required this.fg,
    this.icon,
  });
  final String label;
  final Color bg, fg;
  final IconData? icon;
  @override
  Widget build(BuildContext context) => Container(
    padding: EdgeInsets.symmetric(horizontal: icon == null ? 11 : 9, vertical: 5),
    decoration: BoxDecoration(
      color: bg,
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 13, color: fg),
          const SizedBox(width: 5),
        ],
        Text(
          label,
          style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w700),
        ),
      ],
    ),
  );
}
