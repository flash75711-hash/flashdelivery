/**
 * Admin Users Management Screen
 * صفحة إدارة المستخدمين وتغيير الأدوار
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
  TextInput,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import responsive, { createShadowStyle } from '@/utils/responsive';
import { showSimpleAlert, showConfirm } from '@/lib/alert';
import type { UserRole } from '@/lib/supabase';

interface User {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string;
  role: UserRole;
  status: string;
  created_at?: string;
}

const ROLES: UserRole[] = ['customer', 'driver', 'vendor', 'admin'];
const ROLE_LABELS: Record<UserRole, string> = {
  customer: 'عميل',
  driver: 'سائق',
  vendor: 'تاجر',
  admin: 'مسؤول',
};

export default function AdminUsersScreen() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<UserRole | 'all'>('all');
  
  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);

  useEffect(() => {
    loadUsers();
  }, [filterRole]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('profiles')
        .select('id, full_name, email, phone, role, status, created_at')
        .order('created_at', { ascending: false });

      // فلترة حسب الدور
      if (filterRole !== 'all') {
        query = query.eq('role', filterRole);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading users:', error);
        showSimpleAlert('خطأ', 'فشل تحميل المستخدمين', 'error');
        return;
      }

      setUsers(data || []);
    } catch (error: any) {
      console.error('Error loading users:', error);
      showSimpleAlert('خطأ', 'حدث خطأ أثناء تحميل المستخدمين', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeRole = async (user: User, newRole: UserRole) => {
    const confirmed = await showConfirm(
      'تغيير الدور',
      `هل أنت متأكد من تغيير دور "${user.full_name || user.phone}" من "${ROLE_LABELS[user.role]}" إلى "${ROLE_LABELS[newRole]}"؟`,
      {
        confirmText: 'تغيير',
        cancelText: 'إلغاء',
        type: 'warning',
      }
    );

    if (!confirmed) return;

    setUpdatingUserId(user.id);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', user.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating role:', error);
        showSimpleAlert('خطأ', 'فشل تغيير الدور', 'error');
        return;
      }

      showSimpleAlert('نجح', 'تم تغيير الدور بنجاح', 'success');
      setShowRoleModal(false);
      setSelectedUser(null);
      loadUsers();
    } catch (error: any) {
      console.error('Error updating role:', error);
      showSimpleAlert('خطأ', 'حدث خطأ أثناء تغيير الدور', 'error');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const openRoleModal = (user: User) => {
    setSelectedUser(user);
    setShowRoleModal(true);
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      !searchQuery ||
      user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.phone?.includes(searchQuery) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesSearch;
  });

  const renderUserItem = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={styles.userCard}
      onPress={() => openRoleModal(item)}
      activeOpacity={0.7}
    >
      <View style={styles.userInfo}>
        <View style={styles.userHeader}>
          <Text style={styles.userName}>
            {item.full_name || 'بدون اسم'}
          </Text>
          <View
            style={[
              styles.roleBadge,
              {
                backgroundColor:
                  item.role === 'admin'
                    ? '#FF3B30'
                    : item.role === 'driver'
                    ? '#007AFF'
                    : item.role === 'vendor'
                    ? '#34C759'
                    : '#8E8E93',
              },
            ]}
          >
            <Text style={styles.roleText}>{ROLE_LABELS[item.role]}</Text>
          </View>
        </View>
        <Text style={styles.userPhone}>{item.phone}</Text>
        {item.email && <Text style={styles.userEmail}>{item.email}</Text>}
        <Text style={styles.userStatus}>
          الحالة: {item.status === 'active' ? 'نشط' : 'غير نشط'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#999" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>إدارة المستخدمين</Text>
        <Text style={styles.subtitle}>
          {filteredUsers.length} مستخدم
        </Text>
      </View>

      {/* البحث والفلترة */}
      <View style={styles.filtersContainer}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="بحث بالاسم، رقم الموبايل، أو البريد..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.roleFilters}
          contentContainerStyle={styles.roleFiltersContent}
        >
          <TouchableOpacity
            style={[
              styles.roleFilterButton,
              filterRole === 'all' && styles.roleFilterButtonActive,
            ]}
            onPress={() => setFilterRole('all')}
          >
            <Text
              style={[
                styles.roleFilterText,
                filterRole === 'all' && styles.roleFilterTextActive,
              ]}
            >
              الكل
            </Text>
          </TouchableOpacity>
          {ROLES.map((role) => (
            <TouchableOpacity
              key={role}
              style={[
                styles.roleFilterButton,
                filterRole === role && styles.roleFilterButtonActive,
              ]}
              onPress={() => setFilterRole(role)}
            >
              <Text
                style={[
                  styles.roleFilterText,
                  filterRole === role && styles.roleFilterTextActive,
                ]}
              >
                {ROLE_LABELS[role]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
      ) : filteredUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={64} color="#999" />
          <Text style={styles.emptyText}>لا يوجد مستخدمين</Text>
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          renderItem={renderUserItem}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={loadUsers} />
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Modal لتغيير الدور */}
      <Modal
        visible={showRoleModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowRoleModal(false);
          setSelectedUser(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>تغيير الدور</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowRoleModal(false);
                  setSelectedUser(null);
                }}
              >
                <Ionicons name="close" size={28} color="#000" />
              </TouchableOpacity>
            </View>

            {selectedUser && (
              <View style={styles.modalBody}>
                <Text style={styles.modalUserInfo}>
                  {selectedUser.full_name || 'بدون اسم'}
                </Text>
                <Text style={styles.modalUserPhone}>{selectedUser.phone}</Text>
                <Text style={styles.modalCurrentRole}>
                  الدور الحالي: {ROLE_LABELS[selectedUser.role]}
                </Text>

                <Text style={styles.modalSubtitle}>اختر الدور الجديد:</Text>

                <ScrollView style={styles.rolesList}>
                  {ROLES.map((role) => (
                    <TouchableOpacity
                      key={role}
                      style={[
                        styles.roleOption,
                        selectedUser.role === role && styles.roleOptionCurrent,
                        updatingUserId === selectedUser.id && styles.roleOptionDisabled,
                      ]}
                      onPress={() => {
                        if (selectedUser.role !== role) {
                          handleChangeRole(selectedUser, role);
                        }
                      }}
                      disabled={updatingUserId === selectedUser.id}
                    >
                      <Text
                        style={[
                          styles.roleOptionText,
                          selectedUser.role === role && styles.roleOptionTextCurrent,
                        ]}
                      >
                        {ROLE_LABELS[role]}
                      </Text>
                      {selectedUser.role === role && (
                        <Ionicons name="checkmark-circle" size={24} color="#007AFF" />
                      )}
                      {updatingUserId === selectedUser.id && (
                        <ActivityIndicator size="small" color="#007AFF" />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (tabBarBottomPadding: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#F5F5F5',
      paddingBottom: tabBarBottomPadding,
    },
    header: {
      backgroundColor: '#fff',
      padding: responsive.getResponsivePadding(16),
      ...createShadowStyle({
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      }),
    },
    title: {
      fontSize: responsive.getResponsiveFontSize(24),
      fontWeight: '700',
      color: '#000',
      marginBottom: 4,
    },
    subtitle: {
      fontSize: responsive.getResponsiveFontSize(14),
      color: '#666',
    },
    filtersContainer: {
      backgroundColor: '#fff',
      padding: responsive.getResponsivePadding(12),
      marginBottom: 8,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#F5F5F5',
      borderRadius: 12,
      paddingHorizontal: 12,
      marginBottom: 12,
      height: 44,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: responsive.getResponsiveFontSize(16),
      color: '#000',
    },
    roleFilters: {
      maxHeight: 50,
    },
    roleFiltersContent: {
      paddingRight: 4,
    },
    roleFilterButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: '#F5F5F5',
      marginRight: 8,
    },
    roleFilterButtonActive: {
      backgroundColor: '#007AFF',
    },
    roleFilterText: {
      fontSize: responsive.getResponsiveFontSize(14),
      color: '#666',
      fontWeight: '600',
    },
    roleFilterTextActive: {
      color: '#fff',
    },
    listContent: {
      padding: responsive.getResponsivePadding(12),
    },
    userCard: {
      backgroundColor: '#fff',
      borderRadius: 12,
      padding: responsive.getResponsivePadding(16),
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      ...createShadowStyle({
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
      }),
    },
    userInfo: {
      flex: 1,
    },
    userHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
      flexWrap: 'wrap',
    },
    userName: {
      fontSize: responsive.getResponsiveFontSize(18),
      fontWeight: '600',
      color: '#000',
      marginRight: 8,
    },
    roleBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    roleText: {
      fontSize: responsive.getResponsiveFontSize(12),
      fontWeight: '600',
      color: '#fff',
    },
    userPhone: {
      fontSize: responsive.getResponsiveFontSize(14),
      color: '#666',
      marginBottom: 4,
    },
    userEmail: {
      fontSize: responsive.getResponsiveFontSize(14),
      color: '#666',
      marginBottom: 4,
    },
    userStatus: {
      fontSize: responsive.getResponsiveFontSize(12),
      color: '#999',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 12,
      fontSize: responsive.getResponsiveFontSize(16),
      color: '#666',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: responsive.getResponsivePadding(32),
    },
    emptyText: {
      marginTop: 16,
      fontSize: responsive.getResponsiveFontSize(16),
      color: '#999',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: '#fff',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '80%',
      paddingBottom: responsive.getResponsivePadding(32),
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: responsive.getResponsivePadding(20),
      borderBottomWidth: 1,
      borderBottomColor: '#E5E5EA',
    },
    modalTitle: {
      fontSize: responsive.getResponsiveFontSize(20),
      fontWeight: '700',
      color: '#000',
    },
    modalBody: {
      padding: responsive.getResponsivePadding(20),
    },
    modalUserInfo: {
      fontSize: responsive.getResponsiveFontSize(18),
      fontWeight: '600',
      color: '#000',
      marginBottom: 4,
    },
    modalUserPhone: {
      fontSize: responsive.getResponsiveFontSize(14),
      color: '#666',
      marginBottom: 8,
    },
    modalCurrentRole: {
      fontSize: responsive.getResponsiveFontSize(14),
      color: '#007AFF',
      marginBottom: 20,
      fontWeight: '600',
    },
    modalSubtitle: {
      fontSize: responsive.getResponsiveFontSize(16),
      fontWeight: '600',
      color: '#000',
      marginBottom: 12,
    },
    rolesList: {
      maxHeight: 300,
    },
    roleOption: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: responsive.getResponsivePadding(16),
      borderRadius: 12,
      backgroundColor: '#F5F5F5',
      marginBottom: 8,
    },
    roleOptionCurrent: {
      backgroundColor: '#E3F2FD',
      borderWidth: 2,
      borderColor: '#007AFF',
    },
    roleOptionDisabled: {
      opacity: 0.5,
    },
    roleOptionText: {
      fontSize: responsive.getResponsiveFontSize(16),
      color: '#000',
      fontWeight: '500',
    },
    roleOptionTextCurrent: {
      color: '#007AFF',
      fontWeight: '600',
    },
  });

