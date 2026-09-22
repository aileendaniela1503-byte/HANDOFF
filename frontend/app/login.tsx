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
      await signInWithEmail(email, password);
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
        <Text style={styles.subtitle}>
          For the moment you can&apos;t be there.
        </Text>
      </View>

      <View style={styles.mid}>
        <Text style={styles.pitch}>
          Quietly
