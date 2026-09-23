import { View, Text, Pressable, StyleSheet, ActivityIndicator, TextInput } from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@react-native-vector-icons/feather";

import { useAuth } from "@/src/auth-context";
import { useTheme, makeStyles } from "@/src/theme";
import { IllustrationHands, TextureBackground } from "@/src/illustrations";

export default function Login() {
  const { signInWithEmail } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const onSignIn = async () => {
    setError("");
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      await signInWithEmail(email.trim(), password);
    } catch (e: any) {
      setError(e?.message || "Sign in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} testID="login-screen">
      <TextureBackground />
      <View style={styles.top}>
        <View style={styles.illo}><IllustrationHands size={140} /></View>
        <Text style={styles.title}>Handoff</Text>
        <Text style={styles.subtitle}>For the moment you can&apos;t be there.</Text>
      </View>

      <View style={styles.mid}>
        <Text style={styles.pitch}>
          Quietly build a private plan — pets, medications, dependents, home notes — and hand it off to your
          trusted people the instant something happens.
        </Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          testID="login-email-input"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password"
          testID="login-password-input"
        />
        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>

      <View style={styles.bottom}>
        <Pressable
          onPress={onSignIn}
          disabled={busy}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          testID="login-submit-button"
        >
          {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Sign in</Text>}
        </Pressable>
        <Text style={styles.legal}>We never sell your data. Ever.</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, paddingHorizontal: 24, backgroundColor: colors.surface, justifyContent: "space-between" },
  top: { alignItems: "flex-start", marginTop: 8 },
  illo: { marginBottom: 8, marginLeft: -8 },
  title: { fontSize: 34, fontWeight: "700", color: colors.onSurface, letterSpacing: -0.5 },
  subtitle: { fontSize: 18, color: colors.muted, marginTop: 6 },
  mid: { marginVertical: 24 },
  pitch: { fontSize: 17, lineHeight: 26, color: colors.onSurface, marginBottom: 20 },
  input: {
    minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 16, color: colors.onSurface, backgroundColor: colors.surface,
    marginBottom: 12, fontSize: 16,
  },
  error: { color: colors.danger, fontSize: 14, marginTop: 2 },
  bottom: { gap: 12 },
  cta: {
    backgroundColor: colors.brandPrimary, minHeight: 56, borderRadius: 16,
    alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10,
  },
  ctaText: { color: colors.onBrandPrimary, fontSize: 17, fontWeight: "600" },
  legal: { textAlign: "center", color: colors.muted, fontSize: 13 },
}));
