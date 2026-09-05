import { useCallback, useEffect, useState } from "react";
import {
  View, Text, Pressable, TextInput, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@react-native-vector-icons/feather";
import DateTimePicker from "@react-native-community/datetimepicker";

import { api } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";

function formatDT(d: Date) {
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function PlannedEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [profiles, setProfiles] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(new Set());
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [start, setStart] = useState<Date>(() => {
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return d;
  });
  const [end, setEnd] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(18, 0, 0, 0); return d;
  });
  const [pickerFor, setPickerFor] = useState<"start" | "end" | null>(null);
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");
  const [status, setStatus] = useState<string>("scheduled");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, c, plList] = await Promise.all([
        api.listProfiles(), api.listContacts(),
        isNew ? Promise.resolve([]) : api.listPlanned(),
      ]);
      setProfiles(p || []);
      setContacts(c || []);
      if (!isNew) {
        const pl = (plList || []).find((x: any) => x.event_id === id);
        if (pl) {
          setTitle(pl.title || "");
          setSelectedProfiles(new Set(pl.profile_ids || []));
          setSelectedContacts(new Set(pl.contact_ids || []));
          setStart(new Date(pl.scheduled_start_at));
          setEnd(new Date(pl.scheduled_end_at));
          setStatus(pl.status);
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [id, isNew]);

  useEffect(() => { load(); }, [load]);

  const toggle = (set: Set<string>, setter: any, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    setter(next);
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        title: title.trim() || "Planned handoff",
        profile_ids: Array.from(selectedProfiles),
        contact_ids: Array.from(selectedContacts),
        start_at: start.toISOString(),
        end_at: end.toISOString(),
      };
      if (isNew) await api.createPlanned(body);
      else await api.updatePlanned(String(id), body);
      router.back();
    } catch (e: any) {
      setSaveError(e?.message || "Could not save");
    } finally { setSaving(false); }
  };

  const cancelPlanned = async () => {
    try { await api.cancelPlanned(String(id)); router.back(); } catch (e) { console.error(e); }
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator color={colors.brandPrimary} /></View>;

  const canSave = selectedProfiles.size > 0 && selectedContacts.size > 0 && end > start;
  const isEditable = isNew || status === "scheduled";

  const openPicker = (which: "start" | "end", mode: "date" | "time") => {
    setPickerFor(which);
    setPickerMode(mode);
  };

  const handleDateChange = (event: any, selected?: Date) => {
    const cur = pickerFor === "start" ? start : end;
    const setter = pickerFor === "start" ? setStart : setEnd;
    if (Platform.OS === "android") {
      setPickerFor(null);
      if (event?.type !== "set" || !selected) return;
      const merged = new Date(cur);
      if (pickerMode === "date") {
        merged.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      } else {
        merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      }
      setter(merged);
    } else if (selected) {
      const merged = new Date(cur);
      if (pickerMode === "date") {
        merged.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      } else {
        merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      }
      setter(merged);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <View style={[styles.root, { paddingTop: insets.top }]} testID="planned-edit-screen">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerBtn} testID="planned-back-button">
            <Feather name="chevron-left" size={26} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>{isNew ? "Plan a handoff" : "Planned handoff"}</Text>
          {!isNew ? (
            <Pressable onPress={() => setConfirmCancel(true)} style={styles.headerBtn} testID="planned-cancel-button">
              <Feather name="x" size={22} color={colors.error} />
            </Pressable>
          ) : <View style={styles.headerBtn} />}
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }}>
          <Text style={styles.intro}>
            Share the right instructions with the right people for a set window — a weekend away,
            a sitter covering for you, a scheduled hospital stay. It starts and ends on its own.
          </Text>

          <Text style={styles.label}>What&apos;s it for?</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Weekend trip · Sitter cover · Surgery recovery"
            placeholderTextColor={colors.muted}
            editable={isEditable}
            testID="planned-title-input"
          />

          <Text style={styles.label}>When</Text>
          <View style={styles.timeRow}>
            <View style={styles.timeCard}>
              <Text style={styles.timeLabel}>Start</Text>
              <Pressable onPress={() => isEditable && openPicker("start", "date")} testID="planned-start-date">
                <Text style={styles.timeValue}>{start.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</Text>
              </Pressable>
              <Pressable onPress={() => isEditable && openPicker("start", "time")} testID="planned-start-time">
                <Text style={styles.timeValueMuted}>{start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Text>
              </Pressable>
            </View>
            <View style={styles.timeArrow}><Feather name="arrow-right" size={20} color={colors.muted} /></View>
            <View style={styles.timeCard}>
              <Text style={styles.timeLabel}>End</Text>
              <Pressable onPress={() => isEditable && openPicker("end", "date")} testID="planned-end-date">
                <Text style={styles.timeValue}>{end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</Text>
              </Pressable>
              <Pressable onPress={() => isEditable && openPicker("end", "time")} testID="planned-end-time">
                <Text style={styles.timeValueMuted}>{end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.label}>Which profiles?</Text>
          {profiles.length === 0 ? (
            <Text style={styles.helper}>Create a profile first from Home.</Text>
          ) : profiles.map((p) => {
            const on = selectedProfiles.has(p.profile_id);
            return (
              <Pressable
                key={p.profile_id}
                style={[styles.pickRow, on && styles.pickRowOn]}
                onPress={() => isEditable && toggle(selectedProfiles, setSelectedProfiles, p.profile_id)}
                testID={`pick-profile-${p.profile_id}`}
              >
                <View style={[styles.check, on && styles.checkOn]}>
                  {on ? <Feather name="check" size={14} color={colors.onBrandPrimary} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickTitle}>{p.name}</Text>
                  <Text style={styles.pickSub}>{p.type}</Text>
                </View>
              </Pressable>
            );
          })}

          <Text style={styles.label}>Who to share with?</Text>
          {contacts.length === 0 ? (
            <Text style={styles.helper}>Add a trusted contact first.</Text>
          ) : contacts.map((c) => {
            const on = selectedContacts.has(c.contact_id);
            return (
              <Pressable
                key={c.contact_id}
                style={[styles.pickRow, on && styles.pickRowOn]}
                onPress={() => isEditable && toggle(selectedContacts, setSelectedContacts, c.contact_id)}
                testID={`pick-contact-${c.contact_id}`}
              >
                <View style={[styles.check, on && styles.checkOn]}>
                  {on ? <Feather name="check" size={14} color={colors.onBrandPrimary} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickTitle}>{c.name}</Text>
                  <Text style={styles.pickSub}>{c.email || c.phone || ""}</Text>
                </View>
              </Pressable>
            );
          })}

          {!isEditable ? (
            <Text style={styles.helper}>
              This handoff is already active — sharing started {formatDT(start)}. Cancel to expire the share links immediately.
            </Text>
          ) : null}
        </ScrollView>

        {isEditable && (
          <View style={[styles.saveWrap, { paddingBottom: 16 + insets.bottom }]}>
            {saveError ? <Text style={[styles.helper, { color: colors.error, marginBottom: 8 }]}>{saveError}</Text> : null}
            <Pressable
              style={[styles.saveBtn, (!canSave || saving) && { opacity: 0.5 }]}
              onPress={save}
              disabled={!canSave || saving}
              testID="planned-save-button"
            >
              {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveText}>{isNew ? "Schedule handoff" : "Save changes"}</Text>}
            </Pressable>
          </View>
        )}

        {pickerFor && (
          <DateTimePicker
            value={pickerFor === "start" ? start : end}
            mode={pickerMode}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={handleDateChange}
            minimumDate={pickerFor === "end" ? start : undefined}
          />
        )}
        {Platform.OS === "ios" && pickerFor && (
          <View style={styles.iosPickerBar}>
            <Pressable style={styles.iosPickerDone} onPress={() => setPickerFor(null)}>
              <Text style={styles.iosPickerDoneText}>Done</Text>
            </Pressable>
          </View>
        )}

        <Modal visible={confirmCancel} transparent animationType="fade" onRequestClose={() => setConfirmCancel(false)}>
          <View style={styles.backdrop}>
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Cancel this planned handoff?</Text>
              <Text style={styles.confirmBody}>
                If it&apos;s already active, share links will expire right away. This can&apos;t be undone.
              </Text>
              <Pressable style={styles.dangerBtn} onPress={cancelPlanned} testID="confirm-planned-cancel">
                <Text style={styles.dangerBtnText}>Yes, cancel it</Text>
              </Pressable>
              <Pressable style={styles.close} onPress={() => setConfirmCancel(false)}>
                <Text style={styles.closeText}>Keep it</Text>
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
  intro: { fontSize: 15, color: colors.onSurfaceTertiary, lineHeight: 22, marginBottom: 20 },
  label: { fontSize: 13, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 8 },
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    padding: 14, fontSize: 16, color: colors.onSurface, marginBottom: 20, minHeight: 52,
  },
  timeRow: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 20 },
  timeCard: {
    flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    padding: 12, gap: 4,
  },
  timeLabel: { fontSize: 12, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  timeValue: { fontSize: 16, fontWeight: "700", color: colors.onSurface, paddingVertical: 4 },
  timeValueMuted: { fontSize: 14, color: colors.brandPrimary, fontWeight: "600" },
  timeArrow: { alignItems: "center", justifyContent: "center", width: 24 },
  pickRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.surfaceSecondary, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    padding: 12, marginBottom: 8,
  },
  pickRowOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  check: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  checkOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  pickTitle: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  pickSub: { fontSize: 13, color: colors.muted, marginTop: 2, textTransform: "capitalize" },
  helper: { fontSize: 13, color: colors.muted, marginTop: 8 },
  saveWrap: {
    position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.surface,
    paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border,
  },
  saveBtn: {
    backgroundColor: colors.brandPrimary, minHeight: 56, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  saveText: { color: colors.onBrandPrimary, fontSize: 17, fontWeight: "700" },
  iosPickerBar: {
    position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.surfaceSecondary,
    borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: 20, paddingTop: 8, alignItems: "flex-end",
    paddingRight: 20,
  },
  iosPickerDone: { padding: 8 },
  iosPickerDoneText: { color: colors.brandPrimary, fontSize: 16, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(26,32,38,0.55)", justifyContent: "center" },
  confirmCard: { backgroundColor: colors.surfaceSecondary, marginHorizontal: 24, borderRadius: 20, padding: 24 },
  confirmTitle: { fontSize: 20, fontWeight: "700", color: colors.onSurface },
  confirmBody: { fontSize: 15, color: colors.onSurfaceTertiary, marginTop: 8, lineHeight: 22 },
  dangerBtn: { backgroundColor: colors.error, minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 20 },
  dangerBtnText: { color: colors.onError, fontWeight: "700", fontSize: 16 },
  close: { alignItems: "center", padding: 14, marginTop: 4 },
  closeText: { color: colors.onSurfaceTertiary, fontWeight: "600", fontSize: 15 },
}));
