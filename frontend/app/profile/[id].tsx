import { useEffect, useState } from "react";
import {
  View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform, StyleSheet,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@react-native-vector-icons/feather";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";

import { api, fileUrl, getAuthToken } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";

const TYPES: Array<{ id: string; label: string; icon: string; placeholder: string }> = [
  { id: "pet", label: "Pet", icon: "github", placeholder: "Feeds twice a day: 1 cup dry food at 7am and 6pm. Water bowl by the back door. Vet: Dr. Chen (555-0101). Loves the blue mouse toy. No cheese — upsets stomach." },
  { id: "dependent", label: "Dependent", icon: "user", placeholder: "Bus pickup at 3:15pm at the corner of Maple & 4th. Nut allergy — Epipen in kitchen drawer. Bedtime routine: bath, book, lights out by 8:30." },
  { id: "medication", label: "Medication", icon: "activity", placeholder: "Metformin 500mg with breakfast and dinner. Lisinopril 10mg mornings. Backup supply in top-left kitchen cupboard." },
  { id: "plant", label: "Plant", icon: "feather", placeholder: "Fiddle leaf — water Sundays, once per week, in the living room. Monstera — light water every 10 days, keep out of direct sun." },
  { id: "home", label: "Home", icon: "home", placeholder: "Alarm code: ask me. Trash goes out Tuesday night. Spare key with neighbor Ana (unit 4B). Water shutoff behind laundry room door." },
  { id: "other", label: "Other", icon: "bookmark", placeholder: "Anything else someone would need to step in for you." },
];

export default function ProfileEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [name, setName] = useState("");
  const [type, setType] = useState<string>("pet");
  const [instructions, setInstructions] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const list = await api.listProfiles();
        const p = list.find((x: any) => x.profile_id === id);
        if (p) {
          setName(p.name);
          setType(p.type);
          setInstructions(p.care_instructions || "");
          setPhotoPath(p.photo_path || null);
        }
      } finally { setLoading(false); }
    })();
  }, [id, isNew]);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      allowsEditing: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    try {
      const up = await api.uploadPhoto(asset.uri, asset.fileName || "photo.jpg", asset.mimeType || "image/jpeg");
      setPhotoPath(up.path);
    } catch (e) { console.error(e); }
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = { name: name.trim(), type, care_instructions: instructions, photo_path: photoPath };
      if (isNew) await api.createProfile(body);
      else await api.updateProfile(String(id), body);
      router.back();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    try { await api.deleteProfile(String(id)); router.back(); } catch (e) { console.error(e); }
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }

  const current = TYPES.find((t) => t.id === type)!;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <View style={[styles.root, { paddingTop: insets.top }]} testID="profile-edit-screen">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerBtn} testID="profile-back-button">
            <Feather name="chevron-left" size={26} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>{isNew ? "New profile" : "Edit profile"}</Text>
          {!isNew ? (
            <Pressable onPress={() => setConfirmDelete(true)} style={styles.headerBtn} testID="profile-delete-button">
              <Feather name="trash-2" size={22} color={colors.error} />
            </Pressable>
          ) : <View style={styles.headerBtn} />}
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }}>
          <Text style={styles.label}>Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }} style={{ marginBottom: 20 }}>
            {TYPES.map((t) => {
              const active = t.id === type;
              return (
                <Pressable
                  key={t.id}
                  style={[styles.typeChip, active && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
                  onPress={() => setType(t.id)}
                  testID={`type-chip-${t.id}`}
                >
                  <Feather name={t.icon as any} size={14} color={active ? colors.onBrandPrimary : colors.onSurface} />
                  <Text style={[styles.typeChipText, active && { color: colors.onBrandPrimary }]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            placeholder={type === "pet" ? "e.g. Milo" : type === "dependent" ? "e.g. Sam" : "Give it a name"}
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
            testID="profile-name-input"
          />

          <Text style={styles.label}>Care instructions</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder={current.placeholder}
            placeholderTextColor={colors.muted}
            value={instructions}
            onChangeText={setInstructions}
            multiline
            testID="profile-instructions-input"
          />

          <Text style={styles.label}>Photo (optional)</Text>
          <Pressable style={styles.photoBox} onPress={pickPhoto} testID="profile-photo-picker">
            {photoPath ? (
              <Image
                source={{ uri: fileUrl(photoPath), headers: { Authorization: `Bearer ${getAuthToken()}` } }}
                style={StyleSheet.absoluteFillObject as any}
                contentFit="cover"
              />
            ) : (
              <View style={{ alignItems: "center" }}>
                <Feather name="image" size={26} color={colors.brandPrimary} />
                <Text style={{ color: colors.onSurfaceTertiary, marginTop: 8 }}>Tap to add a photo</Text>
              </View>
            )}
          </Pressable>
        </ScrollView>

        <View style={[styles.saveWrap, { paddingBottom: 16 + insets.bottom }]}>
          <Pressable
            style={[styles.saveBtn, (!name.trim() || saving) && { opacity: 0.5 }]}
            onPress={save}
            disabled={!name.trim() || saving}
            testID="profile-save-button"
          >
            {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveText}>Save profile</Text>}
          </Pressable>
        </View>

        <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
          <View style={styles.backdrop}>
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Delete this profile?</Text>
              <Text style={styles.confirmBody}>The care instructions and photo will be permanently removed.</Text>
              <Pressable style={styles.dangerBtn} onPress={remove} testID="confirm-profile-delete">
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
    padding: 14, fontSize: 16, color: colors.onSurface, marginBottom: 20, minHeight: 52,
  },
  textarea: { minHeight: 140, textAlignVertical: "top" },
  typeChip: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999,
    flexShrink: 0, height: 36,
  },
  typeChipText: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  photoBox: {
    height: 180, borderRadius: 16, borderWidth: 1, borderStyle: "dashed",
    borderColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
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
  confirmBody: { fontSize: 15, color: colors.onSurfaceTertiary, marginTop: 8, lineHeight: 22 },
  dangerBtn: { backgroundColor: colors.error, minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 20 },
  dangerBtnText: { color: colors.onError, fontWeight: "700", fontSize: 16 },
  close: { alignItems: "center", padding: 14, marginTop: 4 },
  closeText: { color: colors.onSurfaceTertiary, fontWeight: "600", fontSize: 15 },
}));
