import React from "react";
import Svg, { Path, Circle, Rect, G, Line, Ellipse, Defs, Pattern, Use } from "react-native-svg";
import { View, StyleSheet } from "react-native";
import { useTheme } from "@/src/theme";

type Props = { size?: number; muted?: boolean };

// Warm line-illustrations. Line-only, soft rounded, calm blue tones.
// Each SVG is 200x160 and scales via width/height props.

export function IllustrationPet({ size = 180 }: Props) {
  const { colors } = useTheme();
  const stroke = colors.brandPrimary;
  const soft = colors.brandSecondary;
  const w = size, h = size * 0.8;
  return (
    <Svg width={w} height={h} viewBox="0 0 200 160" fill="none">
      {/* porch line */}
      <Line x1="10" y1="140" x2="190" y2="140" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <Line x1="20" y1="150" x2="180" y2="150" stroke={soft} strokeWidth="2" strokeLinecap="round" />
      {/* dog body */}
      <Path d="M60 110 C60 90, 80 80, 100 82 C125 84, 140 96, 140 112 L140 130 L60 130 Z" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      {/* legs */}
      <Line x1="72" y1="130" x2="72" y2="140" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="92" y1="130" x2="92" y2="140" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="115" y1="130" x2="115" y2="140" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="132" y1="130" x2="132" y2="140" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      {/* tail */}
      <Path d="M138 100 C150 92, 154 78, 148 68" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* head */}
      <Path d="M55 100 C48 96, 44 84, 50 76 C56 70, 68 70, 74 80" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* ear */}
      <Path d="M52 78 C46 66, 52 58, 60 60" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* eye + nose */}
      <Circle cx="60" cy="88" r="1.5" fill={stroke} />
      <Circle cx="48" cy="94" r="1.8" fill={stroke} />
      {/* sun/moon warm accent */}
      <Circle cx="160" cy="40" r="14" stroke={soft} strokeWidth="2" fill="none" />
    </Svg>
  );
}

export function IllustrationPlant({ size = 180 }: Props) {
  const { colors } = useTheme();
  const stroke = colors.brandPrimary;
  const soft = colors.brandSecondary;
  const w = size, h = size * 0.8;
  return (
    <Svg width={w} height={h} viewBox="0 0 200 160" fill="none">
      {/* windowsill */}
      <Line x1="20" y1="140" x2="180" y2="140" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <Line x1="20" y1="130" x2="180" y2="130" stroke={soft} strokeWidth="2" strokeLinecap="round" />
      {/* window frame */}
      <Rect x="30" y="20" width="140" height="110" stroke={soft} strokeWidth="2" fill="none" rx="4" />
      <Line x1="100" y1="20" x2="100" y2="130" stroke={soft} strokeWidth="1.5" />
      <Line x1="30" y1="75" x2="170" y2="75" stroke={soft} strokeWidth="1.5" />
      {/* pot */}
      <Path d="M80 130 L88 108 L120 108 L128 130 Z" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      {/* leaves */}
      <Path d="M104 108 C104 90, 92 78, 82 76" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <Path d="M104 108 C104 82, 118 68, 130 66" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <Path d="M104 108 C104 96, 96 92, 90 90" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <Ellipse cx="80" cy="72" rx="8" ry="4" transform="rotate(-30 80 72)" stroke={stroke} strokeWidth="2" fill="none" />
      <Ellipse cx="132" cy="62" rx="8" ry="4" transform="rotate(30 132 62)" stroke={stroke} strokeWidth="2" fill="none" />
      <Ellipse cx="88" cy="86" rx="6" ry="3" transform="rotate(-40 88 86)" stroke={stroke} strokeWidth="2" fill="none" />
    </Svg>
  );
}

export function IllustrationDependent({ size = 180 }: Props) {
  const { colors } = useTheme();
  const stroke = colors.brandPrimary;
  const soft = colors.brandSecondary;
  const w = size, h = size * 0.8;
  return (
    <Svg width={w} height={h} viewBox="0 0 200 160" fill="none">
      {/* ground */}
      <Line x1="10" y1="145" x2="190" y2="145" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      {/* bench legs */}
      <Line x1="60" y1="130" x2="60" y2="145" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="140" y1="130" x2="140" y2="145" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      {/* bench seat */}
      <Line x1="45" y1="120" x2="155" y2="120" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="45" y1="125" x2="155" y2="125" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      {/* bench back */}
      <Line x1="45" y1="90" x2="155" y2="90" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="55" y1="90" x2="55" y2="120" stroke={soft} strokeWidth="2" strokeLinecap="round" />
      <Line x1="145" y1="90" x2="145" y2="120" stroke={soft} strokeWidth="2" strokeLinecap="round" />
      {/* small tree */}
      <Circle cx="170" cy="75" r="18" stroke={soft} strokeWidth="2" fill="none" />
      <Line x1="170" y1="93" x2="170" y2="145" stroke={soft} strokeWidth="2" strokeLinecap="round" />
      {/* sun */}
      <Circle cx="30" cy="35" r="12" stroke={soft} strokeWidth="2" fill="none" />
    </Svg>
  );
}

export function IllustrationHome({ size = 180 }: Props) {
  const { colors } = useTheme();
  const stroke = colors.brandPrimary;
  const soft = colors.brandSecondary;
  const w = size, h = size * 0.8;
  return (
    <Svg width={w} height={h} viewBox="0 0 200 160" fill="none">
      <Line x1="10" y1="140" x2="190" y2="140" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      {/* house */}
      <Path d="M60 140 L60 80 L100 50 L140 80 L140 140 Z" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      {/* door */}
      <Rect x="90" y="105" width="20" height="35" stroke={stroke} strokeWidth="2" fill="none" rx="2" />
      <Circle cx="105" cy="122" r="1" fill={stroke} />
      {/* windows */}
      <Rect x="68" y="92" width="14" height="14" stroke={soft} strokeWidth="2" fill="none" rx="1" />
      <Rect x="118" y="92" width="14" height="14" stroke={soft} strokeWidth="2" fill="none" rx="1" />
      {/* chimney */}
      <Path d="M120 66 L120 55 L130 55 L130 74" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      {/* smoke */}
      <Path d="M125 48 C130 42, 125 38, 130 32" stroke={soft} strokeWidth="2" strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export function IllustrationMedication({ size = 180 }: Props) {
  const { colors } = useTheme();
  const stroke = colors.brandPrimary;
  const soft = colors.brandSecondary;
  const w = size, h = size * 0.8;
  return (
    <Svg width={w} height={h} viewBox="0 0 200 160" fill="none">
      <Line x1="10" y1="140" x2="190" y2="140" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      {/* pill bottle */}
      <Rect x="70" y="60" width="60" height="80" stroke={stroke} strokeWidth="2.5" fill="none" rx="6" />
      <Rect x="78" y="50" width="44" height="14" stroke={stroke} strokeWidth="2.5" fill="none" rx="3" />
      <Line x1="80" y1="80" x2="120" y2="80" stroke={soft} strokeWidth="2" strokeLinecap="round" />
      <Line x1="80" y1="90" x2="112" y2="90" stroke={soft} strokeWidth="2" strokeLinecap="round" />
      {/* pill */}
      <Rect x="150" y="100" width="30" height="16" stroke={stroke} strokeWidth="2" fill="none" rx="8" transform="rotate(20 165 108)" />
      <Line x1="164" y1="99" x2="166" y2="117" stroke={stroke} strokeWidth="2" transform="rotate(20 165 108)" />
      {/* clock accent */}
      <Circle cx="30" cy="80" r="14" stroke={soft} strokeWidth="2" fill="none" />
      <Line x1="30" y1="80" x2="30" y2="72" stroke={soft} strokeWidth="2" strokeLinecap="round" />
      <Line x1="30" y1="80" x2="36" y2="80" stroke={soft} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function IllustrationShield({ size = 180 }: Props) {
  const { colors } = useTheme();
  const stroke = colors.brandPrimary;
  const soft = colors.brandSecondary;
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <Path d="M100 20 L160 45 L160 100 C160 140, 130 170, 100 180 C70 170, 40 140, 40 100 L40 45 Z"
        stroke={stroke} strokeWidth="3" strokeLinejoin="round" fill="none" />
      <Path d="M75 100 L92 118 L128 82" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx="100" cy="100" r="72" stroke={soft} strokeWidth="1.5" strokeDasharray="3 6" fill="none" />
    </Svg>
  );
}

export function IllustrationHands({ size = 180 }: Props) {
  const { colors } = useTheme();
  const stroke = colors.brandPrimary;
  const soft = colors.brandSecondary;
  return (
    <Svg width={size} height={size * 0.8} viewBox="0 0 200 160" fill="none">
      {/* two hands cupping a warm circle */}
      <Circle cx="100" cy="80" r="24" stroke={soft} strokeWidth="2" fill="none" />
      <Path d="M40 130 C55 100, 80 90, 100 92 C120 90, 145 100, 160 130" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <Path d="M50 130 C55 118, 65 112, 78 110" stroke={stroke} strokeWidth="2" strokeLinecap="round" fill="none" />
      <Path d="M150 130 C145 118, 135 112, 122 110" stroke={stroke} strokeWidth="2" strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export function IllustrationForType({ type, size = 180 }: { type: string; size?: number }) {
  switch (type) {
    case "pet": return <IllustrationPet size={size} />;
    case "plant": return <IllustrationPlant size={size} />;
    case "dependent": return <IllustrationDependent size={size} />;
    case "home": return <IllustrationHome size={size} />;
    case "medication": return <IllustrationMedication size={size} />;
    default: return <IllustrationHome size={size} />;
  }
}

// Subtle background dot texture — very soft, single-color, non-repeating.
export function TextureBackground() {
  const { colors } = useTheme();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <Pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <Circle cx="1.5" cy="1.5" r="1" fill={colors.brandSecondary} opacity={0.35} />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="400" height="800" fill="url(#dots)" />
      </Svg>
    </View>
  );
}
