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
import { AudioModule, useAudioRecorder, useAudioPlayer, RecordingPresets } from "expo-audio";

import { api, fileUrl, getAuthToken } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { makeStyles, useTheme } from "@/src/theme";
import { IllustrationForType } from "@/src/illustrations";

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
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [type, setType] = useState<string>("pet");
  const [instructions, setInstructions] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [voicePath, setVoicePath] = useState<string | null>(null);
  const [voiceUri, setVoiceUri] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [quotaHit, setQuotaHit] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const playbackUri = voiceUri || (voicePath ? `${fileUrl(voicePath)}` : null);
  const player = useAudioPlayer(playbackUri || undefined);

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
          setVoicePath(p.voice_path || null);
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

  const startRecording = async () => {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) return;
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch (e) { console.error(e); }
  };

  const stopRecording = async () => {
    try {
      await recorder.stop();
      const uri = recorder.uri;
      setRecording(false);
      if (uri) {
        setVoiceBusy(true);
        try {
          const up = await api.uploadAudio(uri, "voice.m4a", "audio/mp4");
          setVoicePath(up.path);
          setVoiceUri(uri);
        } catch (e: any) {
          console.error(e);
        } finally { setVoiceBusy(false); }
      }
    } catch (e) { console.error(e); }
  };

  const removeVoice = () => {
    try { player?.pause(); } catch {}
    setVoicePath(null);
    setVoiceUri(null);
    setQuotaHit(false);
  };

  const playVoice = () => {
    try {
      player.seekTo(0);
      player.play();
    } catch (e) { console.error(e); }
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        name: name.trim(),
        type,
        care_instructions: instructions,
        photo_path: photoPath,
        voice_path: voicePath,
      };
      if (isNew) await api.createProfile(body);
      else await api.updateProfile(String(id), body);
      router.back();
    } catch (e: any) {
      if (e?.status === 402) {
        setQuotaHit(true);
        setSaveError("Voice messages on additional profiles need Handoff Plus. Remove the voice message or upgrade in Settings.");
      } else {
        setSaveError(e?.message || "Could not save profile");
      }
    }
    finally { setSaving(false); }
  };

  const remove = async () => {
    try { await api.deleteProfile(String(id)); router.back(); } catch (e) { console.error(e); }
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }

  const current = TYPES.find((t) => t.id === type)!;
  const tier = user?.subscription_tier || "free";

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

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 160 }}>
          <View style={styles.illoWrap}>
            <IllustrationForType type={type} size={140} />
          </View>

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
                style={StyleSheet.absoluteFill as any}
                contentFit="cover"
              />
            ) : (
              <View style={{ alignItems: "center" }}>
                <Feather name="image" size={26} color={colors.brandPrimary} />
                <Text style={{ color: colors.onSurfaceTertiary, marginTop: 8 }}>Tap to add a photo</Text>
              </View>
            )}
          </Pressable>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 24, marginBottom: 8 }}>
            <Text style={[styles.label, { marginBottom: 0 }]}>Personal message</Text>
            {tier === "free" && <View style={styles.plusChip}><Text style={styles.plusChipText}>Plus for unlimited</Text></View>}
          </View>
          <Text style={styles.helperText}>
            Record a short voice note (10–30 seconds). It plays automatically when your trusted contact opens the link.
          </Text>

          {voicePath ? (
            <View style={styles.voiceCard} testID="voice-card">
              <View style={styles.voiceIcon}><Feather name="mic" size={20} color={colors.onBrandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.voiceTitle}>Voice message saved</Text>
                <Text style={styles.voiceSub}>Tap play to preview</Text>
              </View>
              <Pressable style={styles.voiceBtn} onPress={playVoice} testID="voice-play-button">
                <Feather name="play" size={18} color={colors.brandPrimary} />
              </Pressable>
              <Pressable style={styles.voiceBtn} onPress={removeVoice} testID="voice-remove-button">
                <Feather name="trash-2" size={18} color={colors.error} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={[styles.recordBtn, recording && { backgroundColor: colors.error, borderColor: colors.error }]}
              onPress={recording ? stopRecording : startRecording}
              disabled={voiceBusy}
              testID="voice-record-button"
            >
              {voiceBusy ? (
                <ActivityIndicator color={colors.brandPrimary} />
              ) : recording ? (
                <>
                  <View style={styles.recordPulse} />
                  <Text style={[styles.recordText, { color: colors.onError }]}>Tap to stop</Text>
                </>
              ) : (
                <>
                  <Feather name="mic" size={20} color={colors.brandPrimary} />
                  <Text style={styles.recordText}>Tap to record</Text>
                </>
              )}
            </Pressable>
          )}
        </ScrollView>

        <View style={[styles.saveWrap, { paddingBottom: 16 + insets.bottom }]}>
          {saveError ? (
            <Text style={[styles.helperText, { color: colors.error, marginBottom: 8 }]}>{saveError}</Text>
          ) : null}
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
  illoWrap: { alignItems: "center", marginTop: 4, marginBottom: 20 },
  label: { fontSize: 13, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  helperText: { fontSize: 13, color: colors.muted, marginBottom: 12, lineHeight: 18 },
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
    alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 4,
  },
  plusChip: {
    backgroundColor: colors.brandTertiary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2,
  },
  plusChipText: { fontSize: 11, fontWeight: "700", color: colors.onBrandTertiary },
  recordBtn: {
    minHeight: 56, borderRadius: 14, borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10,
  },
  recordPulse: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.onError },
  recordText: { fontSize: 16, fontWeight: "600", color: colors.brandPrimary },
  voiceCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    padding: 12,
  },
  voiceIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
  voiceTitle: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  voiceSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  voiceBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
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
