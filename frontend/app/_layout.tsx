import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { LogBox, View, ActivityIndicator, StyleSheet } from "react-native";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider, useAuth } from "@/src/auth-context";
import { useTheme } from "@/src/theme";

LogBox.ignoreAllLogs(true);

function Gate() {
  const { loading, user } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const { colors } = useTheme();

  useEffect(() => {
    if (loading) return;
    const first = segments[0] as string | undefined;
    if (first === "share") return; // public route — no gate
    if (!user && first !== "login") {
      router.replace("/login");
    } else if (user && (first === "login" || first === undefined || first === "index")) {
      router.replace("/(app)/home");
    }
  }, [loading, user, segments, router]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface }]}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Gate />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
