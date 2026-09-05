import { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Modal } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@react-native-vector-icons/feather";

import { api } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";

export default function ContactEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [order, setOrder] = useState("1");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const list = await api.listContacts();
        const c = list.find((x: any) => x.contact_id === id);
        if (c) {
          setName(c.name);
          setEmail(c.email || "");
          setPhone(c.phone || "");
          setRelationship(c.relationship || "");
          setOrder(String(c.notify_order || 1));
        }
      } finally { setLoading(false); }
    })();
  }, [id, isNew]);

  const save = async () => {
    if (!name.trim() || (!email.trim() && !phone.trim())) return;
    setSaving(true);
    try {
      const body: any = {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        relationship: relationship.trim(),
        notify_order: parseInt(order || "1", 10) || 1,
      };
      if (isNew) await api.createContact(body);
      else await api.updateContact(String(id), body);
      router.back();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    try { await api.deleteContact(String(id)); router.back(); } catch (e) { console.error(e); }
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator color={colors.brandPrimary} /></View>;

  const valid = name.trim() && (email.trim() || phone.trim());

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <View style={[styles.root, { paddingTop: insets.top }]} testID="contact-edit-screen">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerBtn} testID="contact-back-button">
            <Feather name="chevron-left" size={26} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>{isNew ? "New contact" : "Edit contact"}</Text>
          {!isNew ? (
            <Pressable onPress={() => setConfirmDelete(true)} style={styles.headerBtn} testID="contact-delete-button">
              <Feather name="trash-2" size={22} color={colors.error} />
            </Pressable>
          ) : <View style={styles.headerBtn} />}
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }}>
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Their full name" placeholderTextColor={colors.muted} testID="contact-name-input" />

          <Text style={styles.label}>Relationship</Text>
          <TextInput style={styles.input} value={relationship} onChangeText={setRelationship} placeholder="Partner, neighbor, sibling…" placeholderTextColor={colors.muted} testID="contact-relationship-input" />

          <Text style={styles.label}>Email</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="name@example.com" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" testID="contact-email-input" />

          <Text style={styles.label}>Phone</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="+1 555 123 4567" placeholderTextColor={colors.muted} keyboardType="phone-pad" testID="contact-phone-input" />

          <Text style={styles.label}>Notify order</Text>
          <TextInput style={styles.input} value={order} onChangeText={setOrder} placeholder="1" placeholderTextColor={colors.muted} keyboardType="number-pad" testID="contact-order-input" />

          <Text style={styles.hint}>At least one of email or phone is required.</Text>
        </ScrollView>

        <View style={[styles.saveWrap, { paddingBottom: 16 + insets.bottom }]}>
          <Pressable
            style={[styles.saveBtn, (!valid || saving) && { opacity: 0.5 }]}
            onPress={save}
            disabled={!valid || saving}
            testID="contact-save-button"
          >
            {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveText}>Save contact</Text>}
          </Pressable>
        </View>

        <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
          <View style={styles.backdrop}>
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Delete this contact?</Text>
              <Pressable style={styles.dangerBtn} onPress={remove} testID="confirm-contact-delete">
                <Text style={styles.dangerBtnText}>Delete</Text>
              </Pressable>
              <Pressable style={styles.close} onPress={() => setConfirmDelete(false)}>
                <Text style={styles.closeText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  label: { fontSize: 13, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    padding: 14, fontSize: 16, color: colors.onSurface, marginBottom: 16, minHeight: 52,
  },
  hint: { fontSize: 13, color: colors.muted, marginTop: 4 },
  saveWrap: {
    position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.surface,
    paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border,
  },
  saveBtn: {
    backgroundColor: colors.brandPrimary, minHeight: 56, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  saveText: { color: colors.onBrandPrimary, fontSize: 17, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(26,32,38,0.55)", justifyContent: "center" },
  confirmCard: { backgroundColor: colors.surfaceSecondary, marginHorizontal: 24, borderRadius: 20, padding: 24 },
  confirmTitle: { fontSize: 20, fontWeight: "700", color: colors.onSurface },
  dangerBtn: { backgroundColor: colors.error, minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 20 },
  dangerBtnText: { color: colors.onError, fontWeight: "700", fontSize: 16 },
  close: { alignItems: "center", padding: 14, marginTop: 4 },
  closeText: { color: colors.onSurfaceTertiary, fontWeight: "600", fontSize: 15 },
}));
