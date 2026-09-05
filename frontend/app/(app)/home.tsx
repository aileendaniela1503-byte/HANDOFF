import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Modal } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@react-native-vector-icons/feather";

import { useAuth } from "@/src/auth-context";
import { api, fileUrl } from "@/src/api";
import { useTheme, makeStyles } from "@/src/theme";
import { Image } from "expo-image";

const TYPE_META: Record<string, { icon: string; label: string }> = {
  pet: { icon: "github", label: "Pet" },
  dependent: { icon: "user", label: "Dependent" },
  medication: { icon: "activity", label: "Medication" },
  plant: { icon: "feather", label: "Plant" },
  home: { icon: "home", label: "Home" },
  other: { icon: "bookmark", label: "Other" },
};

export default function Home() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [profiles, setProfiles] = useState<any[]>([]);
  const [activeEvent, setActiveEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [activating, setActivating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, e] = await Promise.all([api.listProfiles(), api.activeEvent()]);
      setProfiles(p || []);
      setActiveEvent(e);
    } catch (err) {
      console.error(err);
    }
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

  const activate = async () => {
    setActivating(true);
    try {
      const ev = await api.activate();
      setActiveEvent(ev);
      setConfirmVisible(false);
    } catch (e: any) {
      console.error(e);
    } finally {
      setActivating(false);
    }
  };

  const firstName = (user?.name || "").split(" ")[0];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="home-screen">
      {/* Sticky header */}
      <View style={styles.header}>
        <Text style={styles.hello}>Hello{firstName ? `, ${firstName}` : ""}</Text>
        <Text style={styles.headline}>Your handoff plan</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        {activeEvent && activeEvent.status === "active" && (
          <Pressable style={styles.activeBanner} onPress={() => router.push("/active-event")} testID="active-event-banner">
            <View style={styles.activeDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.activeTitle}>Handoff is active</Text>
              <Text style={styles.activeSub}>Tap to view contacts &amp; resolve</Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.onBrandPrimary} />
          </Pressable>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Profiles</Text>
          <Pressable onPress={() => router.push("/profile/new")} style={styles.addBtn} testID="add-profile-button">
            <Feather name="plus" size={16} color={colors.brandPrimary} />
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 40 }}><ActivityIndicator color={colors.brandPrimary} /></View>
        ) : profiles.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Feather name="clipboard" size={26} color={colors.brandPrimary} /></View>
            <Text style={styles.emptyTitle}>Nothing to hand off yet</Text>
            <Text style={styles.emptyText}>
              Add a pet, dependent, medication, plant, or home note — anything someone would need to step in.
            </Text>
            <Pressable style={styles.emptyCta} onPress={() => router.push("/profile/new")} testID="empty-add-profile">
              <Text style={styles.emptyCtaText}>Create your first profile</Text>
            </Pressable>
          </View>
        ) : (
          profiles.map((p) => {
            const meta = TYPE_META[p.type] || TYPE_META.other;
            return (
              <Pressable
                key={p.profile_id}
                style={styles.card}
                onPress={() => router.push(`/profile/${p.profile_id}`)}
                testID={`profile-card-${p.profile_id}`}
              >
                {p.photo_path ? (
                  <Image
                    source={{ uri: fileUrl(p.photo_path), headers: { Authorization: `Bearer ${require("@/src/api").getAuthToken()}` } }}
                    style={styles.photo}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.photo, styles.photoPlaceholder]}>
                    <Feather name={meta.icon as any} size={22} color={colors.brandPrimary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={styles.chip}><Text style={styles.chipText}>{meta.label}</Text></View>
                  <Text style={styles.cardTitle}>{p.name}</Text>
                  <Text style={styles.cardSub} numberOfLines={2}>
                    {p.care_instructions || "No instructions yet."}
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.muted} />
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* Sticky Activate CTA */}
      <View style={[styles.activateWrap, { paddingBottom: 16 + insets.bottom }]}>
        <Pressable
          style={({ pressed }) => [
            styles.activateBtn,
            (activeEvent && activeEvent.status === "active") && { backgroundColor: colors.surfaceTertiary },
            pressed && { opacity: 0.9 },
          ]}
          onPress={() => {
            if (activeEvent && activeEvent.status === "active") {
              router.push("/active-event");
            } else {
              setConfirmVisible(true);
            }
          }}
          testID="activate-button"
        >
          <Feather
            name="alert-circle"
            size={22}
            color={activeEvent?.status === "active" ? colors.onSurface : colors.onBrandPrimary}
          />
          <Text
            style={[
              styles.activateText,
              activeEvent?.status === "active" && { color: colors.onSurface },
            ]}
          >
            {activeEvent?.status === "active" ? "View active handoff" : "Activate Handoff"}
          </Text>
        </Pressable>
      </View>

      {/* Confirm sheet */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard} testID="activate-confirm-sheet">
            <View style={styles.modalIcon}>
              <Feather name="alert-triangle" size={26} color={colors.warning} />
            </View>
            <Text style={styles.modalTitle}>Activate your handoff plan?</Text>
            <Text style={styles.modalBody}>
              Your trusted contacts will immediately be sent a secure link with everything they need. Only do this
              in a real emergency, or when testing your plan.
            </Text>
            <Pressable
              style={styles.modalConfirm}
              onPress={activate}
              disabled={activating}
              testID="activate-confirm-button"
            >
              {activating ? (
                <ActivityIndicator color={colors.onError} />
              ) : (
                <Text style={styles.modalConfirmText}>Yes, activate now</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.modalCancel}
              onPress={() => setConfirmVisible(false)}
              testID="activate-cancel-button"
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, backgroundColor: colors.surface },
  hello: { fontSize: 15, color: colors.muted },
  headline: { fontSize: 28, fontWeight: "700", color: colors.onSurface, marginTop: 4, letterSpacing: -0.4 },
  sectionHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: 8, marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: colors.onSurface },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, padding: 6 },
  addBtnText: { color: colors.brandPrimary, fontWeight: "600", fontSize: 15 },
  activeBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.brandPrimary, borderRadius: 16, padding: 16, marginBottom: 8,
  },
  activeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.onBrandPrimary },
  activeTitle: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  activeSub: { color: colors.onBrandPrimary, opacity: 0.85, fontSize: 13, marginTop: 2 },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: colors.border, marginBottom: 12,
    flexDirection: "row", gap: 12, alignItems: "center",
  },
  photo: { width: 60, height: 60, borderRadius: 12, backgroundColor: colors.brandTertiary },
  photoPlaceholder: { alignItems: "center", justifyContent: "center" },
  chip: {
    alignSelf: "flex-start", backgroundColor: colors.brandTertiary, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 3, marginBottom: 4,
  },
  chipText: { color: colors.onBrandTertiary, fontSize: 12, fontWeight: "600" },
  cardTitle: { fontSize: 17, fontWeight: "600", color: colors.onSurface },
  cardSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
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
  emptyCta: { marginTop: 16, backgroundColor: colors.brandPrimary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  emptyCtaText: { color: colors.onBrandPrimary, fontWeight: "600" },
  activateWrap: {
    position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  activateBtn: {
    backgroundColor: colors.brandPrimary, minHeight: 60, borderRadius: 18,
    alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10,
  },
  activateText: { color: colors.onBrandPrimary, fontSize: 18, fontWeight: "700" },
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(26,32,38,0.55)", justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 32,
  },
  modalIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: "#FBEFD9",
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: "700", color: colors.onSurface },
  modalBody: { fontSize: 15, color: colors.onSurfaceTertiary, lineHeight: 22, marginTop: 8 },
  modalConfirm: {
    backgroundColor: colors.error, minHeight: 52, borderRadius: 14, alignItems: "center",
    justifyContent: "center", marginTop: 20,
  },
  modalConfirmText: { color: colors.onError, fontWeight: "700", fontSize: 16 },
  modalCancel: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 8 },
  modalCancelText: { color: colors.onSurfaceTertiary, fontSize: 15, fontWeight: "600" },
}));
