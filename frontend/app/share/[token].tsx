import { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, Pressable } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@react-native-vector-icons/feather";
import { Image } from "expo-image";
import { useAudioPlayer } from "expo-audio";

import { api, BACKEND_URL } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { IllustrationForType } from "@/src/illustrations";

const TYPE_LABEL: Record<string, string> = {
  pet: "Pet", dependent: "Dependent", medication: "Medication", plant: "Plant", home: "Home", other: "Other",
};

function VoicePlayer({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri);
  const { colors } = useTheme();
  const [playing, setPlaying] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    // Autoplay once when the share loads. On native this works; on web autoplay
    // is usually gated behind a user gesture, so we render an obvious play control.
    if (startedRef.current) return;
    startedRef.current = true;
    try { player.play(); setPlaying(true); } catch {}
  }, [player]);

  useEffect(() => {
    const listener = player.addListener?.("playbackStatusUpdate", (status: any) => {
      if (status && typeof status.playing === "boolean") setPlaying(status.playing);
    });
    return () => { try { listener?.remove?.(); } catch {} };
  }, [player]);

  const toggle = () => {
    try {
      if (playing) { player.pause(); setPlaying(false); }
      else { player.seekTo(0); player.play(); setPlaying(true); }
    } catch {}
  };

  return (
    <Pressable
      onPress={toggle}
      style={{
        flexDirection: "row", alignItems: "center", gap: 12,
        backgroundColor: colors.surfaceTertiary, borderRadius: 12, padding: 12, marginBottom: 12,
      }}
      testID="share-voice-player"
    >
      <View style={{
        width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary,
        alignItems: "center", justifyContent: "center",
      }}>
        <Feather name={playing ? "pause" : "play"} size={18} color={colors.onBrandPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSurface }}>A message for you</Text>
        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
          {playing ? "Playing…" : "Tap to play"}
        </Text>
      </View>
    </Pressable>
  );
}

export default function ShareView() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [payload, setPayload] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const p = await api.share(String(token));
        setPayload(p);
      } catch (e: any) {
        setError(e?.message || "Invalid link");
      } finally { setLoading(false); }
    })();
  }, [token]);

  if (loading) return <View style={styles.centered}><ActivityIndicator color={colors.brandPrimary} /></View>;

  if (error || !payload) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]} testID="share-error">
        <Feather name="link" size={36} color={colors.muted} />
        <Text style={styles.errTitle}>Link not found</Text>
        <Text style={styles.errText}>The link may have expired or been resolved.</Text>
      </View>
    );
  }

  if (payload.expired) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]} testID="share-expired">
        <Feather name="check-circle" size={36} color={colors.success} />
        <Text style={styles.errTitle}>This link has expired</Text>
        <Text style={styles.errText}>The situation has been resolved. Thank you for being there.</Text>
      </View>
    );
  }

  return (
    <View style={[{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }]} testID="share-view-screen">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 + insets.bottom }}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Handoff — Active</Text>
          <Text style={styles.heroTitle}>Hi {payload.contact_name || "friend"},</Text>
          <Text style={styles.heroBody}>
            <Text style={{ fontWeight: "700" }}>{payload.owner_name}</Text> needs your help. Below is exactly what to do.
          </Text>
        </View>

        {payload.profiles?.length ? payload.profiles.map((p: any) => (
          <View key={p.profile_id} style={styles.profile} testID={`share-profile-${p.profile_id}`}>
            <View style={styles.chip}><Text style={styles.chipText}>{TYPE_LABEL[p.type] || p.type}</Text></View>
            <Text style={styles.profileTitle}>{p.name}</Text>
            {p.photo_url ? (
              <Image
                source={{ uri: `${BACKEND_URL}${p.photo_url}` }}
                style={styles.photo}
                contentFit="cover"
              />
            ) : (
              <View style={{ alignItems: "center", marginBottom: 12 }}>
                <IllustrationForType type={p.type} size={140} />
              </View>
            )}
            {p.voice_url ? <VoicePlayer uri={`${BACKEND_URL}${p.voice_url}`} /> : null}
            <Text style={styles.instructions}>{p.care_instructions || "No instructions written."}</Text>
          </View>
        )) : (
          <Text style={styles.muted}>No profiles are set up.</Text>
        )}

        <Text style={styles.section}>Other trusted contacts</Text>
        <View style={styles.contactBox}>
          {payload.contacts?.map((c: any, i: number) => (
            <View key={i} style={styles.contactRow}>
              <Text style={styles.contactName}>
                {c.name}{c.relationship ? ` · ${c.relationship}` : ""}
              </Text>
              <Text style={styles.contactInfo}>{[c.phone, c.email].filter(Boolean).join(" · ")}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.foot}>Private page. Expires once {payload.owner_name} marks the situation resolved.</Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: colors.surface, padding: 24 },
  errTitle: { fontSize: 20, fontWeight: "700", color: colors.onSurface, marginTop: 6, textAlign: "center" },
  errText: { fontSize: 15, color: colors.muted, textAlign: "center" },
  hero: { backgroundColor: colors.brandPrimary, borderRadius: 20, padding: 20, marginBottom: 20 },
  heroKicker: { color: colors.onBrandPrimary, opacity: 0.85, fontSize: 13, fontWeight: "600" },
  heroTitle: { color: colors.onBrandPrimary, fontSize: 24, fontWeight: "700", marginTop: 4 },
  heroBody: { color: colors.onBrandPrimary, opacity: 0.95, fontSize: 16, marginTop: 8, lineHeight: 22 },
  profile: {
    backgroundColor: colors.surfaceSecondary, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.border, marginBottom: 12,
  },
  chip: {
    alignSelf: "flex-start", backgroundColor: colors.brandTertiary, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 3, marginBottom: 8,
  },
  chipText: { color: colors.onBrandTertiary, fontSize: 12, fontWeight: "700" },
  profileTitle: { fontSize: 20, fontWeight: "700", color: colors.onSurface, marginBottom: 10 },
  photo: { width: "100%", height: 200, borderRadius: 12, marginBottom: 12 },
  instructions: { fontSize: 16, lineHeight: 24, color: colors.onSurface },
  muted: { color: colors.muted },
  section: { fontSize: 13, fontWeight: "700", color: colors.muted, textTransform: "uppercase", marginTop: 20, marginBottom: 10, letterSpacing: 0.5 },
  contactBox: { backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 },
  contactRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  contactName: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  contactInfo: { fontSize: 14, color: colors.onSurfaceTertiary, marginTop: 4 },
  foot: { textAlign: "center", color: colors.muted, marginTop: 24, fontSize: 13 },
}));
