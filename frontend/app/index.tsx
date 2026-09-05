import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useTheme } from "@/src/theme";

export default function Index() {
  const { colors } = useTheme();
  return (
    <View style={[styles.c, { backgroundColor: colors.surface }]}>
      <ActivityIndicator size="large" color={colors.brandPrimary} />
    </View>
  );
}

const styles = StyleSheet.create({ c: { flex: 1, alignItems: "center", justifyContent: "center" } });
