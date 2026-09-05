import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@react-native-vector-icons/feather";

import { useAuth } from "@/src/auth-context";
import { useTheme, makeStyles } from "@/src/theme";

export default function Login() {
  const { signIn } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const onSignIn = async () => {
    setBusy(true);
    try {
      await signIn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} testID="login-screen">
      <View style={styles.top}>
        <View style={styles.badge}>
          <Feather name="shield" size={32} color={colors.brandPrimary} />
        </View>
        <Text style={styles.title}>Handoff</Text>
        <Text style={styles.subtitle}>
          For the moment you can&apos;t be there.
        </Text>
      </View>

      <View style={styles.mid}>
        <Text style={styles.pitch}>
          Quietly build a private plan — pets, medications, dependents, home notes — and hand it off to your
          trusted people the instant something happens.
        </Text>
        <View style={styles.bullets}>
          {[
            { icon: "lock", text: "Private by default. Nothing shared until you activate." },
            { icon: "users", text: "Your trusted contacts receive a secure, no-login page." },
            { icon: "heart", text: "Peace of mind for the people who depend on you." },
          ].map((b) => (
            <View key={b.icon} style={styles.bullet}>
              <Feather name={b.icon as any} size={18} color={colors.brandPrimary} />
              <Text style={styles.bulletText}>{b.text}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.bottom}>
        <Pressable
          onPress={onSignIn}
          disabled={busy}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          testID="login-google-button"
        >
          {busy ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <>
              <Feather name="log-in" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.ctaText}>Continue with Google</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.legal}>We never sell your data. Ever.</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, paddingHorizontal: 24, backgroundColor: colors.surface, justifyContent: "space-between" },
  top: { alignItems: "flex-start", marginTop: 8 },
  badge: {
    width: 64, height: 64, borderRadius: 16, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.brandTertiary, marginBottom: 16,
  },
  title: { fontSize: 34, fontWeight: "700", color: colors.onSurface, letterSpacing: -0.5 },
  subtitle: { fontSize: 18, color: colors.muted, marginTop: 6 },
  mid: { marginVertical: 24 },
  pitch: { fontSize: 17, lineHeight: 26, color: colors.onSurface, marginBottom: 20 },
  bullets: { gap: 14 },
  bullet: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  bulletText: { flex: 1, fontSize: 15, lineHeight: 22, color: colors.onSurfaceTertiary },
  bottom: { gap: 12 },
  cta: {
    backgroundColor: colors.brandPrimary, minHeight: 56, borderRadius: 16,
    alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10,
  },
  ctaText: { color: colors.onBrandPrimary, fontSize: 17, fontWeight: "600" },
  legal: { textAlign: "center", color: colors.muted, fontSize: 13 },
}));
