import { useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@react-native-vector-icons/feather";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/auth-context";
import { api } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";

const TIERS = [
  { id: "free", name: "Free", price: "$0", features: ["1 profile", "1 trusted contact", "Email notifications"] },
  { id: "plus", name: "Handoff Plus", price: "$4.99/mo", features: ["Unlimited profiles", "Up to 5 contacts", "SMS + Email", "Priority activation"] },
  { id: "family", name: "Family", price: "$8.99/mo", features: ["Everything in Plus", "Shared with household", "Co-manage profiles"] },
];

export default function Settings() {
  const { user, signOut, refresh } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [showTiers, setShowTiers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const currentTier = user?.subscription_tier || "free";

  const upgrade = async (tier: string) => {
    setBusy(true);
    try {
      await api.upgrade(tier);
      await refresh();
      setShowTiers(false);
    } catch (e) { console.error(e); }
    finally { setBusy(false); }
  };

  const deleteAcct = async () => {
    setBusy(true);
    try {
      await api.deleteAccount();
      await signOut();
      router.replace("/login");
    } catch (e) { console.error(e); }
    finally { setBusy(false); setConfirmDelete(false); }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="settings-screen">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 + insets.bottom }}>
        <Text style={styles.headline}>Settings</Text>

        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || "?").slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{user?.name}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
          </View>
        </View>

        <Text style={styles.section}>Subscription</Text>
        <Pressable style={styles.row} onPress={() => setShowTiers(true)} testID="manage-subscription-row">
          <View style={styles.rowIcon}><Feather name="star" size={18} color={colors.brandPrimary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Current plan</Text>
            <Text style={styles.rowSub}>{TIERS.find((t) => t.id === currentTier)?.name || "Free"}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={colors.muted} />
        </Pressable>

        <Text style={styles.section}>Privacy</Text>
        <View style={styles.card}>
          <View style={styles.privacyRow}>
            <Feather name="lock" size={18} color={colors.brandPrimary} />
            <Text style={styles.privacyText}>Your information is yours. We store it securely, we never sell it, and we only use it to do the one job this app exists for.</Text>
          </View>
        </View>

        <Pressable style={styles.row} onPress={() => signOut()} testID="sign-out-row">
          <View style={styles.rowIcon}><Feather name="log-out" size={18} color={colors.onSurfaceTertiary} /></View>
          <Text style={[styles.rowTitle, { flex: 1 }]}>Sign out</Text>
          <Feather name="chevron-right" size={20} color={colors.muted} />
        </Pressable>

        <Pressable style={styles.row} onPress={() => setConfirmDelete(true)} testID="delete-account-row">
          <View style={styles.rowIcon}><Feather name="trash-2" size={18} color={colors.error} /></View>
          <Text style={[styles.rowTitle, { flex: 1, color: colors.error }]}>Delete my account &amp; data</Text>
        </Pressable>

        <Text style={styles.footer}>Handoff — for the moment you can&apos;t be there.</Text>
      </ScrollView>

      <Modal visible={showTiers} transparent animationType="slide" onRequestClose={() => setShowTiers(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet} testID="subscription-sheet">
            <Text style={styles.sheetTitle}>Choose your plan</Text>
            <Text style={styles.sheetSub}>Payment is mocked in this preview — feel free to try any tier.</Text>
            {TIERS.map((t) => {
              const active = t.id === currentTier;
              return (
                <Pressable
                  key={t.id}
                  style={[styles.tierCard, active && { borderColor: colors.brandPrimary, borderWidth: 2 }]}
                  onPress={() => upgrade(t.id)}
                  disabled={busy}
                  testID={`tier-${t.id}`}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={styles.tierName}>{t.name}</Text>
                    <Text style={styles.tierPrice}>{t.price}</Text>
                  </View>
                  {t.features.map((f) => (
                    <View key={f} style={styles.featRow}>
                      <Feather name="check" size={14} color={colors.brandPrimary} />
                      <Text style={styles.featText}>{f}</Text>
                    </View>
                  ))}
                  {active && <Text style={styles.activeTag}>Current plan</Text>}
                </Pressable>
              );
            })}
            <Pressable style={styles.close} onPress={() => setShowTiers(false)}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <View style={styles.backdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Delete everything?</Text>
            <Text style={styles.confirmBody}>This permanently removes your profiles, contacts, and account. Cannot be undone.</Text>
            <Pressable style={styles.dangerBtn} onPress={deleteAcct} disabled={busy} testID="confirm-delete-button">
              {busy ? <ActivityIndicator color={colors.onError} /> : <Text style={styles.dangerBtnText}>Delete permanently</Text>}
            </Pressable>
            <Pressable style={styles.close} onPress={() => setConfirmDelete(false)}>
              <Text style={styles.closeText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  headline: { fontSize: 28, fontWeight: "700", color: colors.onSurface, marginTop: 8, marginBottom: 16, letterSpacing: -0.4 },
  userCard: {
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    borderRadius: 16, padding: 16, flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 24,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 20, fontWeight: "700", color: colors.onBrandTertiary },
  userName: { fontSize: 17, fontWeight: "600", color: colors.onSurface },
  userEmail: { fontSize: 14, color: colors.muted, marginTop: 2 },
  section: { fontSize: 13, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    padding: 14, marginBottom: 8,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  rowTitle: { fontSize: 16, fontWeight: "600", color: colors.onSurface },
  rowSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  card: {
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, padding: 14, marginBottom: 20,
  },
  privacyRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  privacyText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.onSurfaceTertiary },
  footer: { textAlign: "center", color: colors.muted, marginTop: 40, fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: "rgba(26,32,38,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  sheetTitle: { fontSize: 22, fontWeight: "700", color: colors.onSurface },
  sheetSub: { fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: 16 },
  tierCard: {
    backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    padding: 16, marginBottom: 10,
  },
  tierName: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  tierPrice: { fontSize: 15, fontWeight: "600", color: colors.brandPrimary },
  featRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 6 },
  featText: { fontSize: 14, color: colors.onSurfaceTertiary },
  activeTag: { marginTop: 10, color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
  close: { alignItems: "center", padding: 14, marginTop: 4 },
  closeText: { color: colors.onSurfaceTertiary, fontWeight: "600", fontSize: 15 },
  confirmCard: { backgroundColor: colors.surfaceSecondary, marginHorizontal: 20, borderRadius: 20, padding: 24, marginBottom: 40 },
  confirmTitle: { fontSize: 20, fontWeight: "700", color: colors.onSurface },
  confirmBody: { fontSize: 15, color: colors.onSurfaceTertiary, marginTop: 8, lineHeight: 22 },
  dangerBtn: { backgroundColor: colors.error, minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 20 },
  dangerBtnText: { color: colors.onError, fontWeight: "700", fontSize: 16 },
}));
