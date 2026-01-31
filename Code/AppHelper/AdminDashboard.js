import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Button,
  Alert,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Image,
  Modal,
  ScrollView
} from 'react-native';
import { getDatabase, ref, get, set } from '@react-native-firebase/database';
import { unbanUserWithEmail } from '../ChatScreen/utils';
import { useGlobalState } from '../GlobelStats';
import Ionicons from 'react-native-vector-icons/Ionicons';

const decodeEmail = (encoded) => encoded.replace(/\(dot\)/g, '.');
const encodeEmail = (email) => email.replace(/\./g, '(dot)');

const BAD_KEYS = new Set(['undefined', 'onloaduser', '', null, undefined]);

const AdminUnbanScreen = () => {
  const { theme } = useGlobalState();
  const isDark = theme === 'dark';

  const [bannedUsers, setBannedUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBannedUser, setSelectedBannedUser] = useState(null); // For Modal

  const db = useMemo(() => getDatabase(), []);

  const fetchNode = useCallback(async (path) => {
    const snapshot = await get(ref(db, path));
    if (!snapshot.exists()) return [];
    const data = snapshot.val() ?? {};
    return Object.keys(data)
      .filter((k) => !BAD_KEYS.has(k))
      .map((encodedEmail) => {
        const entry = data[encodedEmail];
        return {
          encodedEmail,
          decodedEmail: decodeEmail(encodedEmail),
          reason: entry?.reason ?? '—',
          strikeCount: entry?.strikeCount ?? 0,
          bannedUntil: entry?.bannedUntil ?? null,
          displayName: entry?.displayName || 'Unknown',
          avatar: entry?.avatar || 'https://bloxfruitscalc.com/wp-content/uploads/2025/display-pic.png',
          bannedBy: entry?.bannedBy || null,
          bannedAt: entry?.bannedAt || null,
        };
      });
  }, [db]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchNode('banned_users_by_email');
      setBannedUsers(list);
    } catch (err) {
      Alert.alert('Error', 'Could not load banned users.');
    } finally {
      setLoading(false);
    }
  }, [fetchNode]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchAll();
    } finally {
      setRefreshing(false);
    }
  };

  const handleUnban = async (decodedEmail) => {
    try {
      const success = await unbanUserWithEmail(decodedEmail);
      if (success) {
        setSelectedBannedUser(null); // Close modal if open
        await fetchAll();
      }
    } catch (err) {
      Alert.alert('Error', 'Could not unban user.');
    }
  };

  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return bannedUsers;
    const q = searchQuery.toLowerCase();
    return bannedUsers.filter((u) =>
      u.decodedEmail.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q)
    );
  }, [bannedUsers, searchQuery]);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => setSelectedBannedUser(item)}
      style={[
        styles.compactCard,
        {
          backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
          borderColor: isDark ? '#333' : '#E0E0E0',
        },
      ]}
    >
      <Image source={{ uri: item.avatar }} style={styles.avatarSmall} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[styles.cardTitle, { color: isDark ? '#FFF' : '#000' }]} numberOfLines={1}>
          {item.displayName}
        </Text>
        <Text style={[styles.cardSubtitle, { color: isDark ? '#AAA' : '#666' }]} numberOfLines={1}>
          {item.decodedEmail}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <View style={styles.strikeBadge}>
          <Text style={styles.strikeText}>{item.strikeCount} Strikes</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={isDark ? '#555' : '#CCC'} style={{ marginTop: 4 }} />
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: isDark ? '#000' : '#fff' }]}>
        <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', color: isDark ? '#fff' : '#000', marginBottom: 16 }}>
        Banned Users ({bannedUsers.length})
      </Text>

      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search name or email..."
        placeholderTextColor={isDark ? '#888' : '#666'}
        style={[
          styles.searchInput,
          {
            backgroundColor: isDark ? '#1E1E1E' : '#F5F5F5',
            color: isDark ? '#FFF' : '#000',
            borderColor: isDark ? '#444' : '#DDD',
          },
        ]}
      />

      <FlatList
        data={filteredList}
        keyExtractor={(item) => item.encodedEmail}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? '#fff' : '#000'} />
        }
        contentContainerStyle={{ paddingBottom: 100 }}
        renderItem={renderItem}
        ListEmptyComponent={
          <Text style={{ color: isDark ? '#888' : '#666', textAlign: 'center', marginTop: 40 }}>
            No banned users found.
          </Text>
        }
      />

      {/* Details Modal */}
      <Modal
        visible={!!selectedBannedUser}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedBannedUser(null)}
      >
        <View style={[styles.modalContainer, { backgroundColor: isDark ? '#121212' : '#F9F9F9' }]}>
          {selectedBannedUser && (
            <ScrollView contentContainerStyle={{ padding: 24, alignItems: 'center' }}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setSelectedBannedUser(null)}
              >
                <Text style={{ color: '#007AFF', fontSize: 17 }}>Close</Text>
              </TouchableOpacity>

              <Image source={{ uri: selectedBannedUser.avatar }} style={styles.avatarLarge} />
              <Text style={[styles.modalTitle, { color: isDark ? '#FFF' : '#000' }]}>
                {selectedBannedUser.displayName}
              </Text>
              <Text style={[styles.modalSubtitle, { color: isDark ? '#AAA' : '#555' }]}>
                {selectedBannedUser.decodedEmail}
              </Text>

              <View style={[styles.infoSection, { backgroundColor: isDark ? '#1E1E1E' : '#FFF' }]}>
                <InfoRow label="Strikes" value={selectedBannedUser.strikeCount} isDark={isDark} />
                <InfoRow label="Reason" value={selectedBannedUser.reason} isDark={isDark} />
                <InfoRow
                  label="Banned Until"
                  value={
                    selectedBannedUser.bannedUntil === 'permanent'
                      ? 'Permanent'
                      : new Date(selectedBannedUser.bannedUntil).toLocaleString()
                  }
                  isDark={isDark}
                />
                <InfoRow
                  label="Banned At"
                  value={selectedBannedUser.bannedAt ? new Date(selectedBannedUser.bannedAt).toLocaleString() : '—'}
                  isDark={isDark}
                />
              </View>

              {/* Banned By Section */}
              {selectedBannedUser.bannedBy && (
                <View style={[styles.infoSection, { backgroundColor: isDark ? '#1E1E1E' : '#FFF', marginTop: 16 }]}>
                  <Text style={[styles.sectionHeader, { color: isDark ? '#AAA' : '#666' }]}>BANNED BY</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                    {selectedBannedUser.bannedBy.avatar && (
                      <Image source={{ uri: selectedBannedUser.bannedBy.avatar }} style={styles.avatarTiny} />
                    )}
                    <View style={{ marginLeft: 10 }}>
                      <Text style={{ color: isDark ? '#FFF' : '#000', fontWeight: '600' }}>
                        {selectedBannedUser.bannedBy.displayName || 'System'}
                      </Text>
                      <Text style={{ color: isDark ? '#888' : '#666', fontSize: 12 }}>
                        {selectedBannedUser.bannedBy.role || 'Admin'}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={styles.unbanButton}
                onPress={() => {
                  Alert.alert(
                    'Unban User',
                    `Are you sure you want to unban ${selectedBannedUser.displayName}?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Unban', style: 'destructive', onPress: () => handleUnban(selectedBannedUser.decodedEmail) }
                    ]
                  );
                }}
              >
                <Text style={styles.unbanButtonText}>Unban User</Text>
              </TouchableOpacity>

            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
};

const InfoRow = ({ label, value, isDark }) => (
  <View style={styles.infoRow}>
    <Text style={[styles.infoLabel, { color: isDark ? '#888' : '#666' }]}>{label}</Text>
    <Text style={[styles.infoValue, { color: isDark ? '#FFF' : '#000' }]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchInput: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    fontSize: 16
  },
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  avatarSmall: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ccc' },
  cardTitle: { fontWeight: '700', fontSize: 16 },
  cardSubtitle: { fontSize: 13, marginTop: 2 },
  strikeBadge: { backgroundColor: '#FF3B30', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  strikeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  // Modal Styles
  modalContainer: { flex: 1 },
  closeButton: { alignSelf: 'flex-end', padding: 10, marginBottom: 10 },
  avatarLarge: { width: 100, height: 100, borderRadius: 50, marginBottom: 16, backgroundColor: '#ccc' },
  modalTitle: { fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  modalSubtitle: { fontSize: 14, textAlign: 'center', marginBottom: 24 },
  infoSection: { width: '100%', borderRadius: 16, padding: 16, marginBottom: 8 },
  sectionHeader: { fontSize: 11, fontWeight: 'bold', letterSpacing: 1, marginBottom: 4 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#ffffff20' },
  infoLabel: { fontSize: 15 },
  infoValue: { fontSize: 15, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },

  avatarTiny: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#888' },

  unbanButton: {
    marginTop: 32,
    backgroundColor: '#FF3B30',
    width: '100%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  unbanButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});

export default AdminUnbanScreen;
