import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@react-native-vector-icons/feather";

import { api } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";

const STATUS_META: Record<string, { icon: string; label: string; color: keyof any }> = {
  sent: { icon: "check-circle", label: "Sent", color: "success" },
  failed: { icon: "x-circle", label: "Failed", color: "error" },
  pending: { icon: "clock", label: "Pending", color: "warning" },
  skipped_no_email: { icon: "alert-circle", label: "No email on file", color: "warning" },
};

export default function ActiveEvent() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);

  const load = useCallback(async () => {
    try {
      const ev = await api.activeEvent();
      setEvent(ev);
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const resolve = async () => {
    if (!event) return;
    setResolving(true);
    try {
      await api.resolveEvent(event.event_id);
      router.back();
    } catch (e) { console.error(e); }
    finally { setResolving(false); }
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator color={colors.brandPrimary} /></View>;

  if (!event) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Feather name="check-circle" size={40} color={colors.success} />
        <Text style={styles.emptyTitle}>No active handoff</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const triggered = new Date(event.triggered_at);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="active-event-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} testID="event-back-button">
          <Feather name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Active handoff</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }}>
        <View style={styles.banner}>
          <View style={styles.pulse} />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>
              {event.event_type === "planned"
                ? (event.title || "Planned handoff") + " is active"
                : "Your plan is active"}
            </Text>
            <Text style={styles.bannerSub}>Started {triggered.toLocaleString()}</Text>
            {event.event_type === "planned" && event.scheduled_end_at ? (
              <Text style={styles.bannerSub}>Auto-expires {new Date(event.scheduled_end_at).toLocaleString()}</Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.section}>Notification status</Text>
        {(event.shares || []).length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No trusted contacts were on file. Add one so your plan is ready.</Text>
          </View>
        ) : (
          event.shares.map((s: any) => {
            const meta = STATUS_META[s.delivery_status] || STATUS_META.pending;
            const color = (colors as any)[meta.color] as string;
            return (
              <View key={s.share_token} style={styles.row} testID={`share-row-${s.share_token}`}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(s.contact_name || "?").slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{s.contact_name}</Text>
                  <Text style={styles.rowSub}>{s.contact_email || "No email on file"}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: color + "22" }]}>
                  <Feather name={meta.icon as any} size={14} color={color} />
                  <Text style={[styles.statusText, { color }]}>{meta.label}</Text>
                </View>
              </View>
            );
          })
        )}

        <Text style={styles.hint}>
          Contacts received a link to your handoff page. The link stops working the moment you resolve this event.
        </Text>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: 16 + insets.bottom }]}>
        <Pressable style={styles.resolveBtn} onPress={resolve} disabled={resolving} testID="resolve-event-button">
          {resolving ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
            <>
              <Feather name="check" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.resolveText}>Mark resolved</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  banner: {
    flexDirection: "row", gap: 12, alignItems: "center",
    backgroundColor: colors.brandPrimary, padding: 20, borderRadius: 16,
  },
  pulse: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.onBrandPrimary },
  bannerTitle: { color: colors.onBrandPrimary, fontSize: 18, fontWeight: "700" },
  bannerSub: { color: colors.onBrandPrimary, opacity: 0.85, marginTop: 4, fontSize: 13 },
  section: { fontSize: 13, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 24, marginBottom: 12 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    padding: 12, marginBottom: 8,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onBrandTertiary, fontWeight: "700", fontSize: 16 },
  rowTitle: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  rowSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 12, fontWeight: "700" },
  empty: { backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16 },
  emptyText: { color: colors.onSurfaceTertiary },
  hint: { color: colors.muted, fontSize: 13, marginTop: 20, lineHeight: 20 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.onSurface, marginTop: 12 },
  backBtn: { padding: 12, marginTop: 12 },
  backBtnText: { color: colors.brandPrimary, fontWeight: "600" },
  bottomBar: {
    position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.surface,
    paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border,
  },
  resolveBtn: {
    backgroundColor: colors.success, minHeight: 56, borderRadius: 16,
    alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8,
  },
  resolveText: { color: colors.onSuccess, fontSize: 17, fontWeight: "700" },
}));
