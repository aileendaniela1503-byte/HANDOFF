import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@react-native-vector-icons/feather";

import { api } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";

export default function Contacts() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await api.listContacts();
      setContacts(c || []);
    } catch (err) { console.error(err); }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="contacts-screen">
      <View style={styles.header}>
        <Text style={styles.headline}>Trusted contacts</Text>
        <Text style={styles.sub}>The people we&apos;ll notify at activation, in order.</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 40 }}><ActivityIndicator color={colors.brandPrimary} /></View>
        ) : contacts.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Feather name="users" size={26} color={colors.brandPrimary} /></View>
            <Text style={styles.emptyTitle}>No trusted contacts yet</Text>
            <Text style={styles.emptyText}>
              Add at least one person we can reach when you activate your handoff plan.
            </Text>
          </View>
        ) : (
          contacts.map((c, i) => (
            <Pressable
              key={c.contact_id}
              style={styles.card}
              onPress={() => router.push(`/contact/${c.contact_id}`)}
              testID={`contact-card-${c.contact_id}`}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(c.name || "?").slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={styles.cardTitle}>{c.name}</Text>
                  <View style={styles.orderChip}>
                    <Text style={styles.orderChipText}>#{i + 1}</Text>
                  </View>
                </View>
                {c.relationship ? <Text style={styles.cardSub}>{c.relationship}</Text> : null}
                <Text style={styles.contactInfo}>{c.email || c.phone}</Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
          ))
        )}
      </ScrollView>

      <View style={[styles.floatWrap, { paddingBottom: 16 + insets.bottom }]}>
        <Pressable
          style={styles.fab}
          onPress={() => router.push("/contact/new")}
          testID="add-contact-button"
        >
          <Feather name="plus" size={20} color={colors.onBrandPrimary} />
          <Text style={styles.fabText}>Add contact</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  headline: { fontSize: 28, fontWeight: "700", color: colors.onSurface, letterSpacing: -0.4 },
  sub: { fontSize: 15, color: colors.muted, marginTop: 4 },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: colors.border, marginBottom: 12,
    flexDirection: "row", gap: 12, alignItems: "center",
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: colors.onBrandTertiary, fontWeight: "700", fontSize: 18 },
  cardTitle: { fontSize: 17, fontWeight: "600", color: colors.onSurface },
  cardSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  contactInfo: { fontSize: 14, color: colors.onSurfaceTertiary, marginTop: 4 },
  orderChip: { backgroundColor: colors.brandTertiary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  orderChipText: { fontSize: 12, fontWeight: "700", color: colors.onBrandTertiary },
  empty: {
    backgroundColor: colors.surfaceSecondary, borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: colors.border, alignItems: "center",
  },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: colors.onSurface },
  emptyText: { fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 6, lineHeight: 20 },
  floatWrap: {
    position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12,
  },
  fab: {
    backgroundColor: colors.brandPrimary, minHeight: 52, borderRadius: 16,
    alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10,
  },
  fabText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
}));
