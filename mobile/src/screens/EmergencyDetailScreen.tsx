import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  Clipboard,
  RefreshControl,
  SafeAreaView,
  DeviceEventEmitter,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import api from '../services/api';
import { audioEvidenceService, PlaybackStatus } from '../services/audioEvidenceService';
import { RootStackParamList } from '../navigation/types';

type EmergencyDetailRouteProp = RouteProp<RootStackParamList, 'EmergencyDetail'>;

interface EmergencyDetailData {
  id: number;
  trigger_type: string;
  status: string;
  score: number;
  location_lat: number | null;
  location_lng: number | null;
  timestamp: string;
  resolved_address?: string;
  google_maps_url?: string;
  location_accuracy?: number;
  audio_status?: 'none' | 'pending' | 'preparing' | 'uploading' | 'uploaded' | 'uploaded_local' | 'failed' | 'recording_failed';
  audio_duration?: number;
  audio_mime_type?: string;
  audio_path?: string;
  user?: number;
  sender_name?: string;
  sender_phone?: string;
}

export default function EmergencyDetailScreen() {
  const route = useRoute<EmergencyDetailRouteProp>();
  const navigation = useNavigation();

  const initialEmergencyId = route.params?.emergencyId;
  const [currentId, setCurrentId] = useState<number | string | undefined>(initialEmergencyId);
  const [recentList, setRecentList] = useState<EmergencyDetailData[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [emergency, setEmergency] = useState<EmergencyDetailData | null>(route.params?.initialData || null);

  // Audio Playback State
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>({
    status: 'paused',
    position: 0,
    duration: 0,
  });
  const [signedAudioUrl, setSignedAudioUrl] = useState<string | null>(null);
  const [isUrlLoading, setIsUrlLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Upload Progress and Timeout States
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isRetryingUpload, setIsRetryingUpload] = useState(false);
  const [isUploadTimedOut, setIsUploadTimedOut] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  // Fetch list of recent emergency incidents
  const fetchRecentList = useCallback(async () => {
    try {
      const res = await api.get('/history/');
      if (Array.isArray(res.data) && res.data.length > 0) {
        setRecentList(res.data);
        return res.data;
      }
    } catch (e) {
      console.warn('[EMERGENCY_DETAIL] Failed fetching incident history list:', e);
    }
    return [];
  }, []);

  // Fetch single emergency incident details
  const fetchEmergencyDetails = useCallback(async (targetId?: number | string, isRefresh = false) => {
    const idToFetch = targetId || currentId;
    if (!idToFetch) return;

    try {
      if (isRefresh) setRefreshing(true);
      const response = await api.get(`/history/${idToFetch}/`);
      setEmergency(response.data);
      setCurrentId(response.data.id);
    } catch (err: any) {
      console.error(`[EMERGENCY_DETAIL] Failed loading emergency ${idToFetch}:`, err);
      Alert.alert('Error', 'Unable to load emergency incident details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentId]);

  // Initial load
  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      const list = await fetchRecentList();

      if (!isMounted) return;

      if (initialEmergencyId) {
        // Explicit ID requested by caller
        await fetchEmergencyDetails(initialEmergencyId);
      } else if (list.length > 0) {
        // Auto-select latest incident with audio evidence, or first incident
        const withAudio = list.find(
          (item: EmergencyDetailData) => item.audio_status === 'uploaded' || item.audio_status === 'uploaded_local'
        );
        const autoSelected = withAudio || list[0];
        setCurrentId(autoSelected.id);
        await fetchEmergencyDetails(autoSelected.id);
      } else {
        setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [initialEmergencyId]);

  // When switching currentId
  const handleSelectIncident = async (newId: number) => {
    if (newId === currentId) return;

    // Stop existing playback when switching incidents
    await audioEvidenceService.stop();
    setSignedAudioUrl(null);
    setAudioError(null);
    setUploadProgress(null);
    setIsUploadTimedOut(false);
    pollCountRef.current = 0;
    setPlaybackStatus({ status: 'paused', position: 0, duration: 0 });

    setCurrentId(newId);
    setLoading(true);
    await fetchEmergencyDetails(newId);
  };

  // Listen to live upload progress for the current incident
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onAudioUploadProgress', (event: any) => {
      if (currentId && (String(event.emergencyId) === String(currentId) || Number(event.emergencyId) === currentId)) {
        setUploadProgress(event.percent);
      }
    });
    return () => sub.remove();
  }, [currentId]);

  // If audio is in progress (pending, preparing, uploading), poll with a bounded 45s timeout
  useEffect(() => {
    const status = emergency?.audio_status;
    const isTransitional = status === 'pending' || status === 'preparing' || status === 'uploading';

    if (isTransitional && !isUploadTimedOut) {
      pollCountRef.current = 0;
      pollIntervalRef.current = setInterval(async () => {
        pollCountRef.current += 1;
        if (pollCountRef.current >= 15) { // 45 seconds timeout (15 * 3s)
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsUploadTimedOut(true);
          return;
        }
        if (currentId) {
          await fetchEmergencyDetails(currentId);
        }
      }, 3000);
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [emergency?.audio_status, currentId, fetchEmergencyDetails, isUploadTimedOut]);

  const handleRetryUpload = async () => {
    if (!currentId) return;
    setIsRetryingUpload(true);
    setUploadProgress(null);
    try {
      const res = await audioEvidenceService.retryUpload(currentId, (percent) => {
        setUploadProgress(percent);
      });
      if (res.success) {
        setIsUploadTimedOut(false);
        await fetchEmergencyDetails(currentId, true);
        Alert.alert('Upload Succeeded', 'Audio evidence clip was successfully uploaded to secure Supabase Storage.');
      } else {
        Alert.alert('Retry Notice', res.error || 'Failed to upload audio evidence.');
      }
    } catch (e: any) {
      Alert.alert('Retry Error', e?.message || 'Unexpected error while retrying upload.');
    } finally {
      setIsRetryingUpload(false);
    }
  };

  // Audio Player Event Subscription
  useEffect(() => {
    const unsubscribe = audioEvidenceService.subscribePlaybackStatus((status) => {
      setPlaybackStatus(status);
      if (status.status === 'error') {
        setAudioError(status.error || 'Playback error occurred');
      }
    });

    return () => {
      unsubscribe();
      audioEvidenceService.stop();
    };
  }, []);

  const handlePlayAudio = async () => {
    if (!currentId) return;
    setAudioError(null);

    // If currently playing, pause
    if (playbackStatus.status === 'playing') {
      await audioEvidenceService.pause();
      return;
    }

    // If completed and existing URL exists, replay from beginning
    if (playbackStatus.status === 'completed' && signedAudioUrl) {
      await audioEvidenceService.seekTo(0);
      await audioEvidenceService.resume();
      return;
    }

    // If paused with existing URL and non-zero position, resume
    if (playbackStatus.status === 'paused' && signedAudioUrl && playbackStatus.position > 0) {
      await audioEvidenceService.resume();
      return;
    }

    // Otherwise fetch fresh signed URL and start
    setIsUrlLoading(true);
    const result = await audioEvidenceService.fetchSignedAudioUrl(currentId);
    setIsUrlLoading(false);

    if (result.success && result.signed_url) {
      setSignedAudioUrl(result.signed_url);
      await audioEvidenceService.play(result.signed_url);
    } else {
      setAudioError(result.error || 'Could not obtain audio playback link.');
      Alert.alert('Audio Error', result.error || 'Playback link is expired or unauthorized.');
    }
  };

  const handleStopAudio = async () => {
    await audioEvidenceService.stop();
    setPlaybackStatus({ status: 'paused', position: 0, duration: playbackStatus.duration });
  };

  const handleRestartAudio = async () => {
    if (signedAudioUrl) {
      await audioEvidenceService.seekTo(0);
      await audioEvidenceService.resume();
    } else {
      await handlePlayAudio();
    }
  };

  const openGoogleMaps = () => {
    if (!emergency) return;
    const url =
      emergency.google_maps_url ||
      (emergency.location_lat && emergency.location_lng
        ? `https://www.google.com/maps/search/?api=1&query=${emergency.location_lat},${emergency.location_lng}`
        : null);

    if (url) {
      Linking.openURL(url).catch(() => {
        Alert.alert('Error', 'Unable to open Google Maps.');
      });
    } else {
      Alert.alert('Location Unavailable', 'No GPS coordinates were recorded for this emergency.');
    }
  };

  const copyLocationLink = () => {
    const url =
      emergency?.google_maps_url ||
      (emergency?.location_lat && emergency?.location_lng
        ? `https://www.google.com/maps/search/?api=1&query=${emergency.location_lat},${emergency.location_lng}`
        : null);

    if (url) {
      Clipboard.setString(url);
      Alert.alert('Copied', 'Google Maps link copied to clipboard.');
    }
  };

  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Find another incident that has audio evidence
  const audioSampleIncident = recentList.find(
    (item) => (item.audio_status === 'uploaded' || item.audio_status === 'uploaded_local') && item.id !== currentId
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#dc2626" />
        <Text style={styles.loadingText}>Loading Emergency Details...</Text>
      </View>
    );
  }

  if (!emergency) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>No emergency incidents found.</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hasLocation = emergency.location_lat !== null && emergency.location_lng !== null;
  const totalDurationMs = (emergency.audio_duration || 15) * 1000;
  const progressRatio =
    playbackStatus.duration > 0
      ? Math.min(playbackStatus.position / playbackStatus.duration, 1)
      : totalDurationMs > 0 && playbackStatus.position > 0
      ? Math.min(playbackStatus.position / totalDurationMs, 1)
      : 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              await fetchRecentList();
              if (currentId) await fetchEmergencyDetails(currentId, true);
            }}
            colors={['#dc2626']}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backNavBtn}>
            <Text style={styles.backNavText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Emergency Alert</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Incident Switcher Bar */}
        {recentList.length > 1 && (
          <View style={styles.switcherSection}>
            <Text style={styles.switcherLabel}>SELECT INCIDENT:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
              {recentList.slice(0, 10).map((inc) => {
                const isSelected = inc.id === currentId;
                const hasAudio = inc.audio_status === 'uploaded' || inc.audio_status === 'uploaded_local';
                return (
                  <TouchableOpacity
                    key={inc.id}
                    style={[styles.pill, isSelected && styles.activePill]}
                    onPress={() => handleSelectIncident(inc.id)}
                  >
                    <Text style={[styles.pillText, isSelected && styles.activePillText]}>
                      #{inc.id} {hasAudio ? '🎙️' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Status Banner */}
        <View style={styles.alertBanner}>
          <View style={styles.badgeRow}>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>
                {emergency.status.toUpperCase()}
              </Text>
            </View>
            <View style={styles.incidentIdBadge}>
              <Text style={styles.incidentIdBadgeText}>Incident #{emergency.id}</Text>
            </View>
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreBadgeText}>Score: {emergency.score}%</Text>
            </View>
          </View>
          {emergency.sender_name && (
            <Text style={styles.senderText}>
              👤 Sender: {emergency.sender_name}{emergency.sender_phone ? ` (${emergency.sender_phone})` : ''}
            </Text>
          )}
          <Text style={styles.triggerType}>
            Trigger: {emergency.trigger_type.replace('_', ' ').toUpperCase()}
          </Text>
          <Text style={styles.timestamp}>
            {new Date(emergency.timestamp).toLocaleString()}
          </Text>
        </View>

        {/* Location Section */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionIcon}>📍</Text>
            <Text style={styles.sectionTitle}>Incident Location</Text>
          </View>

          {hasLocation ? (
            <>
              <Text style={styles.addressText}>
                {emergency.resolved_address || 'Address unavailable'}
              </Text>
              <Text style={styles.coordText}>
                Coordinates: {emergency.location_lat?.toFixed(5)}, {emergency.location_lng?.toFixed(5)}
                {emergency.location_accuracy ? ` (±${emergency.location_accuracy.toFixed(1)}m)` : ''}
              </Text>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.mapButton} onPress={openGoogleMaps}>
                  <Text style={styles.mapButtonText}>🗺️ View on Google Maps</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.copyButton} onPress={copyLocationLink}>
                  <Text style={styles.copyButtonText}>📋 Copy Link</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.unavailableBox}>
              <Text style={styles.unavailableText}>Location not available for this alert</Text>
            </View>
          )}
        </View>

        {/* Audio Evidence Section */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionIcon}>🎙️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Audio Evidence (15-Sec Clip)</Text>
              {emergency.audio_status === 'uploaded' && (
                <Text style={styles.verifiedSubtext}>✓ Verified Storage Record</Text>
              )}
            </View>
          </View>

          {emergency.audio_status === 'uploaded' || emergency.audio_status === 'uploaded_local' ? (
            <View style={styles.audioPlayerBox}>
              <View style={styles.audioMetaRow}>
                <Text style={styles.audioMetaText}>
                  Format: WAV (16kHz mono) • Duration: {(emergency.audio_duration || 15).toFixed(0)}s
                </Text>
                <View style={styles.playbackStateBadge}>
                  <Text style={styles.playbackStateText}>
                    {playbackStatus.status === 'playing'
                      ? '● PLAYING'
                      : playbackStatus.status === 'completed'
                      ? '✓ COMPLETED'
                      : playbackStatus.status === 'loading'
                      ? '⏳ LOADING'
                      : '⏸️ READY'}
                  </Text>
                </View>
              </View>

              {/* Progress Bar */}
              <View style={styles.progressBarBackground}>
                <View style={[styles.progressBarFill, { width: `${progressRatio * 100}%` }]} />
              </View>

              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatTime(playbackStatus.position)}</Text>
                <Text style={styles.timeText}>
                  {formatTime(playbackStatus.duration || totalDurationMs)}
                </Text>
              </View>

              {/* Player Controls */}
              <View style={styles.controlsRow}>
                <TouchableOpacity
                  style={[styles.playButton, isUrlLoading && styles.disabledButton]}
                  onPress={handlePlayAudio}
                  disabled={isUrlLoading}
                >
                  {isUrlLoading ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.playButtonText}>
                      {playbackStatus.status === 'playing' ? '⏸️ Pause' : '▶️ Listen to Evidence'}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.secondaryAudioBtn} onPress={handleRestartAudio}>
                  <Text style={styles.secondaryAudioText}>🔄 Restart</Text>
                </TouchableOpacity>

                {(playbackStatus.status === 'playing' || playbackStatus.position > 0) && (
                  <TouchableOpacity style={styles.secondaryAudioBtn} onPress={handleStopAudio}>
                    <Text style={styles.secondaryAudioText}>⏹️ Stop</Text>
                  </TouchableOpacity>
                )}
              </View>

              {audioError && (
                <View style={styles.errorBox}>
                  <Text style={styles.audioErrorText}>⚠️ {audioError}</Text>
                  <TouchableOpacity onPress={handlePlayAudio} style={styles.retryBtn}>
                    <Text style={styles.retryBtnText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : emergency.audio_status === 'preparing' && !isUploadTimedOut ? (
            <View style={styles.pendingBox}>
              <ActivityIndicator color="#f59e0b" size="small" />
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingText}>Preparing recording...</Text>
                <Text style={styles.pendingSubtext}>
                  Emergency audio clip is being recorded from microphone.
                </Text>
              </View>
            </View>
          ) : (emergency.audio_status === 'uploading' || emergency.audio_status === 'pending') && !isUploadTimedOut ? (
            <View style={styles.pendingBox}>
              <ActivityIndicator color="#dc2626" size="small" />
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingText}>
                  {uploadProgress !== null && uploadProgress > 0
                    ? `Uploading audio evidence (${uploadProgress}%)...`
                    : 'Uploading audio evidence to secure storage...'}
                </Text>
                <Text style={styles.pendingSubtext}>
                  Encrypting and storing clip in private Supabase Storage.
                </Text>
              </View>
            </View>
          ) : emergency.audio_status === 'failed' || isUploadTimedOut ? (
            <View style={styles.failedBox}>
              <View style={styles.failedHeaderRow}>
                <Text style={styles.failedIcon}>⚠️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.failedTitle}>Upload failed — retry available</Text>
                  <Text style={styles.failedSubtext}>
                    {isUploadTimedOut
                      ? 'Upload timed out. Tap retry below to upload the audio evidence.'
                      : 'Audio recording could not be uploaded to secure storage. Tap retry below.'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.retryUploadBtn, isRetryingUpload && styles.disabledButton]}
                onPress={handleRetryUpload}
                disabled={isRetryingUpload}
              >
                {isRetryingUpload ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.retryUploadBtnText}>🔄 Retry Audio Upload</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <View style={styles.unavailableBox}>
                <Text style={styles.unavailableText}>
                  {emergency.audio_status === 'recording_failed'
                    ? 'No valid audio recording available (Microphone capture failed)'
                    : 'No valid audio recording available for this incident'}
                </Text>
              </View>

              {/* Helper callout if another incident has audio (e.g. Incident 41) */}
              {audioSampleIncident && (
                <TouchableOpacity
                  style={styles.suggestionBox}
                  onPress={() => handleSelectIncident(audioSampleIncident.id)}
                >
                  <Text style={styles.suggestionTitle}>
                    🎙️ Audio evidence available on Incident #{audioSampleIncident.id}
                  </Text>
                  <Text style={styles.suggestionSub}>
                    Tap to view Incident #{audioSampleIncident.id} with verified 15-second WAV recording.
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Security / Privacy Footnote */}
        <View style={styles.privacyNote}>
          <Text style={styles.privacyNoteText}>
            🔒 End-to-end access restricted: Audio evidence is stored securely in private storage and streamed via time-limited bearer links only to verified emergency contacts.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 18,
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#f8fafc',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backNavBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#1e293b',
    borderRadius: 8,
  },
  backNavText: {
    color: '#f8fafc',
    fontWeight: 'bold',
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: 'bold',
  },
  switcherSection: {
    marginBottom: 14,
  },
  switcherLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  pill: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  activePill: {
    backgroundColor: '#dc2626',
    borderColor: '#ef4444',
  },
  pillText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  activePillText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  alertBanner: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  statusBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  incidentIdBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  incidentIdBadgeText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
  scoreBadge: {
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  scoreBadgeText: {
    color: '#60a5fa',
    fontSize: 12,
    fontWeight: '600',
  },
  senderText: {
    color: '#fca5a5',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  triggerType: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  timestamp: {
    color: '#94a3b8',
    fontSize: 13,
  },
  sectionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: 'bold',
  },
  verifiedSubtext: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  addressText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    marginBottom: 6,
  },
  coordText: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 14,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  mapButton: {
    flex: 1,
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  mapButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  copyButton: {
    backgroundColor: '#334155',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 14,
  },
  audioPlayerBox: {
    marginTop: 4,
  },
  audioMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  audioMetaText: {
    color: '#94a3b8',
    fontSize: 12,
    flex: 1,
  },
  playbackStateBadge: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  playbackStateText: {
    color: '#e2e8f0',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#dc2626',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  timeText: {
    color: '#64748b',
    fontSize: 12,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playButton: {
    flex: 1,
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  secondaryAudioBtn: {
    backgroundColor: '#334155',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  secondaryAudioText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    backgroundColor: '#450a0a',
    padding: 8,
    borderRadius: 6,
  },
  audioErrorText: {
    color: '#f87171',
    fontSize: 12,
    flex: 1,
  },
  retryBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#dc2626',
    borderRadius: 4,
    marginLeft: 8,
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  pendingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 8,
    gap: 10,
  },
  pendingText: {
    color: '#e2e8f0',
    fontSize: 13,
    flex: 1,
  },
  unavailableBox: {
    backgroundColor: '#0f172a',
    padding: 12,
    borderRadius: 8,
  },
  unavailableText: {
    color: '#64748b',
    fontSize: 14,
    fontStyle: 'italic',
  },
  suggestionBox: {
    marginTop: 10,
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  suggestionTitle: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  suggestionSub: {
    color: '#94a3b8',
    fontSize: 12,
  },
  privacyNote: {
    paddingHorizontal: 8,
    marginTop: 10,
  },
  privacyNoteText: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  failedBox: {
    backgroundColor: '#1e293b',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  failedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  failedIcon: {
    fontSize: 22,
  },
  failedTitle: {
    color: '#f87171',
    fontSize: 14,
    fontWeight: 'bold',
  },
  failedSubtext: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  retryUploadBtn: {
    backgroundColor: '#dc2626',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  retryUploadBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  pendingSubtext: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
});
