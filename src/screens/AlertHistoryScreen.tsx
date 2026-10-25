import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  Alert,
  Platform,
  StatusBar,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { audioEvidenceService, PlaybackStatus } from '../services/audioEvidenceService';
import { NavigationProps } from '../navigation/types';

interface EmergencyAlertItem {
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
  audio_status?: 'none' | 'pending' | 'uploaded' | 'uploaded_local' | 'failed';
  audio_duration?: number;
  audio_mime_type?: string;
  audio_path?: string;
  user?: number;
}

export default function AlertHistoryScreen() {
  const navigation = useNavigation<NavigationProps>();

  const [alerts, setAlerts] = useState<EmergencyAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Audio Playback State for inline player
  const [playingAlertId, setPlayingAlertId] = useState<number | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>({
    status: 'paused',
    position: 0,
    duration: 0,
  });
  const [isAudioLoading, setIsAudioLoading] = useState(false);

  const fetchAlertHistory = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh || alerts.length > 0) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setErrorMessage(null);

      const response = await api.get('/history/');
      if (Array.isArray(response.data)) {
        setAlerts(response.data);
      } else {
        setAlerts([]);
      }
    } catch (err: any) {
      console.error('[ALERT_HISTORY] Failed to fetch emergency history:', err);
      const msg = err.response?.data?.detail || err.message || 'Failed to load emergency history.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAlertHistory();
    }, [fetchAlertHistory])
  );

  // Listen to native audio player events
  useEffect(() => {
    const unsubscribe = audioEvidenceService.subscribePlaybackStatus((status) => {
      setPlaybackStatus(status);
      if (status.status === 'completed' || status.status === 'error') {
        if (status.status === 'completed') {
          // Playback completed
          setPlayingAlertId(null);
        } else if (status.error) {
          Alert.alert('Playback Error', status.error);
          setPlayingAlertId(null);
        }
      }
    });

    return () => {
      unsubscribe();
      audioEvidenceService.stop();
    };
  }, []);

  // Stop audio on unmount or blur
  useFocusEffect(
    useCallback(() => {
      return () => {
        audioEvidenceService.stop();
        setPlayingAlertId(null);
      };
    }, [])
  );

  const handleTogglePlayAudio = async (alertItem: EmergencyAlertItem) => {
    // If currently playing this alert, pause it
    if (playingAlertId === alertItem.id && playbackStatus.status === 'playing') {
      await audioEvidenceService.pause();
      return;
    }

    // If paused on this alert, resume
    if (playingAlertId === alertItem.id && playbackStatus.status === 'paused' && playbackStatus.position > 0) {
      await audioEvidenceService.resume();
      return;
    }

    // Stop any other currently playing clip
    if (playingAlertId !== null && playingAlertId !== alertItem.id) {
      await audioEvidenceService.stop();
    }

    setPlayingAlertId(alertItem.id);
    setIsAudioLoading(true);

    try {
      const result = await audioEvidenceService.fetchSignedAudioUrl(alertItem.id);
      setIsAudioLoading(false);

      if (result.success && result.signed_url) {
        await audioEvidenceService.play(result.signed_url);
      } else {
        setPlayingAlertId(null);
        Alert.alert('Audio Playback', result.error || 'Failed to obtain authorized playback URL.');
      }
    } catch (e: any) {
      setIsAudioLoading(false);
      setPlayingAlertId(null);
      Alert.alert('Audio Error', e.message || 'Playback failed.');
    }
  };

  const handleOpenDetails = (alertItem: EmergencyAlertItem) => {
    audioEvidenceService.stop();
    setPlayingAlertId(null);
    navigation.navigate('EmergencyDetail', {
      emergencyId: alertItem.id,
      initialData: alertItem,
    });
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }) + ' • ' + date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const formatAudioTime = (millis: number) => {
    const totalSecs = Math.floor(millis / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const renderAlertItem = ({ item }: { item: EmergencyAlertItem }) => {
    const hasLocation = item.location_lat !== null && item.location_lng !== null;
    const hasAudio = item.audio_status === 'uploaded' || item.audio_status === 'uploaded_local';
    const isPlayingThis = playingAlertId === item.id;
    const isAudioPlaying = isPlayingThis && playbackStatus.status === 'playing';

    const durationSeconds = item.audio_duration || 15;
    const progressPercent = isPlayingThis && playbackStatus.duration > 0
      ? Math.min((playbackStatus.position / playbackStatus.duration) * 100, 100)
      : isPlayingThis && playbackStatus.position > 0
      ? Math.min((playbackStatus.position / (durationSeconds * 1000)) * 100, 100)
      : 0;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => handleOpenDetails(item)}
      >
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={styles.idGroup}>
            <Text style={styles.incidentIdText}>Incident #{item.id}</Text>
            <View
              style={[
                styles.statusBadge,
                item.status === 'dispatched'
                  ? styles.statusDispatched
                  : item.status === 'resolved'
                  ? styles.statusResolved
                  : styles.statusPending,
              ]}
            >
              <Text style={styles.statusBadgeText}>
                {item.status.toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={styles.triggerBadge}>
            <Text style={styles.triggerBadgeText}>
              {item.trigger_type.replace('_', ' ').toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Date / Time */}
        <Text style={styles.dateText}>🕒 {formatDate(item.timestamp)}</Text>

        {/* Location Row */}
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>📍</Text>
          <Text
            style={[styles.infoText, !hasLocation && styles.mutedText]}
            numberOfLines={2}
          >
            {hasLocation
              ? item.resolved_address || `Lat: ${item.location_lat?.toFixed(5)}, Lng: ${item.location_lng?.toFixed(5)}`
              : 'GPS location unavailable'}
          </Text>
        </View>

        {/* Audio Status Row */}
        <View style={styles.audioRow}>
          <View style={styles.audioStatusContainer}>
            <Text style={styles.infoIcon}>
              {hasAudio ? '🎙️' : item.audio_status === 'pending' ? '⏳' : '🔇'}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.audioStatusLabel, hasAudio && styles.audioAvailableLabel]}>
                {hasAudio
                  ? `Voice Evidence (${durationSeconds.toFixed(0)}s WAV)`
                  : item.audio_status === 'pending'
                  ? 'Voice Audio: Uploading...'
                  : item.audio_status === 'failed'
                  ? 'Voice Audio: Upload Failed'
                  : 'No Voice Audio Recorded'}
              </Text>
              {hasAudio && (
                <Text style={styles.audioSubtext}>Private Supabase Bearer Stream</Text>
              )}
            </View>
          </View>

          {/* Inline Play/Pause control for alerts with valid audio evidence */}
          {hasAudio && (
            <TouchableOpacity
              style={[styles.playButton, isPlayingThis && styles.playingButton]}
              onPress={(e) => {
                e.stopPropagation();
                handleTogglePlayAudio(item);
              }}
              disabled={isAudioLoading && isPlayingThis}
            >
              {isAudioLoading && isPlayingThis ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.playButtonText}>
                  {isAudioPlaying ? '⏸️ Pause' : '▶️ Play'}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Inline Audio Progress Bar if currently playing */}
        {isPlayingThis && (
          <View style={styles.inlinePlayerBox}>
            <View style={styles.progressBarBackground}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            </View>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatAudioTime(playbackStatus.position)}</Text>
              <Text style={styles.timeText}>{formatAudioTime(durationSeconds * 1000)}</Text>
            </View>
          </View>
        )}

        {/* Footer Link */}
        <View style={styles.cardFooter}>
          <Text style={styles.viewDetailsText}>View Incident Details & Map →</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const audioCount = alerts.filter(
    (a) => a.audio_status === 'uploaded' || a.audio_status === 'uploaded_local'
  ).length;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Alert History</Text>
        <TouchableOpacity
          onPress={() => fetchAlertHistory(true)}
          style={styles.refreshIconBtn}
        >
          <Text style={styles.refreshIconText}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Bar */}
      {!loading && !errorMessage && alerts.length > 0 && (
        <View style={styles.statsBar}>
          <Text style={styles.statsText}>
            Total Alerts: <Text style={styles.statsHighlight}>{alerts.length}</Text>
          </Text>
          <Text style={styles.statsDivider}>•</Text>
          <Text style={styles.statsText}>
            Audio Evidence: <Text style={styles.statsHighlight}>{audioCount} clips</Text>
          </Text>
        </View>
      )}

      {/* Main Body */}
      {loading && alerts.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#dc2626" />
          <Text style={styles.loadingText}>Loading Emergency History...</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Failed to Load Alerts</Text>
          <Text style={styles.errorMessage}>{errorMessage}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => fetchAlertHistory()}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : alerts.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyIcon}>🛡️</Text>
          <Text style={styles.emptyTitle}>No Emergency Alerts</Text>
          <Text style={styles.emptySubtitle}>
            You haven't triggered or received any emergency alerts yet. Stay safe!
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => fetchAlertHistory(true)}
          >
            <Text style={styles.retryButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderAlertItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchAlertHistory(true)}
              colors={['#dc2626']}
              tintColor="#dc2626"
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 20) + 4 : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    minHeight: 38,
    justifyContent: 'center',
  },
  backButtonText: {
    color: '#f8fafc',
    fontWeight: 'bold',
    fontSize: 14,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: 'bold',
  },
  refreshIconBtn: {
    padding: 6,
  },
  refreshIconText: {
    fontSize: 18,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 10,
  },
  statsText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  statsHighlight: {
    color: '#f8fafc',
    fontWeight: 'bold',
  },
  statsDivider: {
    color: '#475569',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  idGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  incidentIdText: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusDispatched: {
    backgroundColor: '#dc2626',
  },
  statusResolved: {
    backgroundColor: '#16a34a',
  },
  statusPending: {
    backgroundColor: '#d97706',
  },
  statusBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  triggerBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  triggerBadgeText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '600',
  },
  dateText: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 6,
  },
  infoIcon: {
    fontSize: 15,
    marginTop: 1,
  },
  infoText: {
    color: '#e2e8f0',
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  mutedText: {
    color: '#64748b',
    fontStyle: 'italic',
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    padding: 10,
    borderRadius: 8,
    marginTop: 6,
    gap: 8,
  },
  audioStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  audioStatusLabel: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  audioAvailableLabel: {
    color: '#60a5fa',
  },
  audioSubtext: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 1,
  },
  playButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  playingButton: {
    backgroundColor: '#ea580c',
  },
  playButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  inlinePlayerBox: {
    marginTop: 8,
    paddingHorizontal: 4,
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#dc2626',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    color: '#64748b',
    fontSize: 11,
  },
  cardFooter: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    alignItems: 'flex-end',
  },
  viewDetailsText: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 16,
  },
  emptyIcon: {
    fontSize: 54,
    marginBottom: 12,
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorTitle: {
    color: '#ef4444',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  errorMessage: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 18,
  },
  retryButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
