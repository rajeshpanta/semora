import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert, Text, TextInput } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
  useMutation,
  useQuery,
  useQueryClient } from '@tanstack/react-query';
import { Stack,
  router,
  useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { useEffect,
  useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/app/_layout';
import { DatePicker } from '@/components/DatePicker';
import {
  archiveCollaboration,
  createGroupAssignment,
  deleteCollaboration,
  getCollaborationDetail,
  inviteClassmates,
  leaveCollaboration,
  listOutstandingInvites,
  publishCourseDeadlines,
  removeCollaborationMember,
  revokeCollaborationInvite,
  setCollaborationLocalCourse,
  setCollaborationMemberRole,
  setGroupAssignmentCompleted,
  subscribeToCollaboration,
  syncCollaborationToPlanner,
  listSharedDecks,
  syncCollaborationDecks,
} from '@/lib/collaboration';
import { SCREEN_MAX_WIDTH } from '@/lib/constants';
import { formatLocalDate } from '@/lib/dates';
import { useCourses } from '@/lib/queries';
import { useResponsive } from '@/lib/responsive';
import { useColors } from '@/lib/theme';
import { useAppStore } from '@/store/appStore';
import type { CourseCollaborationMember } from '@/types/database';

export default function CollaborationDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const { session } = useSession();
  const semesterId = useAppStore((state) => state.selectedSemesterId);
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const query = useQuery({
    queryKey: ['collaboration', id],
    queryFn: () => getCollaborationDetail(id),
    enabled: !!id,
  });
  const detail = query.data;
  const me = detail?.members.find((member) => member.user_id === session?.user.id);
  const isOwner = me?.role === 'owner';
  const canEdit = me?.role === 'owner' || me?.role === 'editor';

  // Shared decks (migration 051). Sync on open is safe to run every time:
  // a deck whose published content hasn't changed since this member's last
  // sync is skipped entirely, so review progress is never rebuilt underneath
  // them — see the content-hash guard in sync_collaboration_decks.
  const sharedDecks = useQuery({
    queryKey: ['sharedDecks', id],
    queryFn: () => listSharedDecks(id),
    enabled: !!id,
  });

  useEffect(() => {
    if (!id) return;
    syncCollaborationDecks(id)
      .then((r) => {
        if (r.decks_synced > 0) {
          queryClient.invalidateQueries({ queryKey: ['decks'] });
        }
      })
      .catch(() => {});
  }, [id, queryClient]);

  const invalidateAfterMembership = () => {
    queryClient.invalidateQueries({ queryKey: ['collaboration', id] });
    queryClient.invalidateQueries({ queryKey: ['collaborations'] });
  };

  useEffect(() => {
    if (!id) return;
    return subscribeToCollaboration(id, () => {
      queryClient.invalidateQueries({ queryKey: ['collaboration', id] });
      queryClient.invalidateQueries({ queryKey: ['collaborations'] });
      if (semesterId) {
        syncCollaborationToPlanner(id, semesterId)
          .then(() => queryClient.invalidateQueries({ queryKey: ['tasks'] }))
          .catch(() => {});
      }
    });
  }, [id, semesterId, queryClient]);

  const sync = useMutation({
    mutationFn: async () => {
      if (!semesterId) throw new Error('Select a semester before syncing to your planner.');
      return syncCollaborationToPlanner(id, semesterId);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['collaboration', id] });
      Alert.alert(
        'Planner updated',
        `${result.deadlines_synced} shared deadlines and ${result.group_assignments_synced} group assignments are in your planner.`,
      );
    },
    onError: (error: Error) => Alert.alert('Couldn’t sync planner', error.message),
  });
  const publish = useMutation({
    mutationFn: () => publishCourseDeadlines(id),
    onSuccess: (count) => {
      query.refetch();
      Alert.alert('Deadlines published', `${count} current course deadlines are shared with classmates.`);
    },
    onError: (error: Error) => Alert.alert('Couldn’t publish', error.message),
  });
  const toggle = useMutation({
    mutationFn: ({ assignmentId, completed }: { assignmentId: string; completed: boolean }) =>
      setGroupAssignmentCompleted(assignmentId, session!.user.id, completed),
    onSuccess: () => {
      query.refetch();
      if (semesterId) {
        syncCollaborationToPlanner(id, semesterId)
          .then(() => queryClient.invalidateQueries({ queryKey: ['tasks'] }))
          .catch(() => {});
      }
    },
    onError: (error: Error) => Alert.alert('Couldn’t update group task', error.message),
  });

  const removeMember = useMutation({
    mutationFn: (memberUserId: string) => removeCollaborationMember(id, memberUserId),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      invalidateAfterMembership();
    },
    onError: (error: Error) => Alert.alert('Couldn’t remove member', error.message),
  });
  const changeRole = useMutation({
    mutationFn: ({ memberUserId, role }: { memberUserId: string; role: 'owner' | 'editor' | 'viewer' }) =>
      setCollaborationMemberRole(id, memberUserId, role),
    onSuccess: () => {
      Haptics.selectionAsync().catch(() => {});
      invalidateAfterMembership();
    },
    onError: (error: Error) => Alert.alert('Couldn’t change role', error.message),
  });
  const leave = useMutation({
    mutationFn: () => leaveCollaboration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaborations'] });
      if (router.canGoBack()) router.back();
      else router.replace('/collaboration' as any);
    },
    onError: (error: Error) => Alert.alert('Couldn’t leave space', error.message),
  });

  const confirmRemove = (member: CourseCollaborationMember) => {
    Alert.alert(
      'Remove member',
      `Remove ${member.display_name} from this space? Their synced planner keeps what it already has.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeMember.mutate(member.user_id) },
      ],
    );
  };
  const confirmLeave = () => {
    Alert.alert(
      'Leave space',
      'You’ll stop seeing new shared deadlines and group work. Your own planner stays as it is.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => leave.mutate() },
      ],
    );
  };
  // Promoting to owner is how a SOLE owner hands off a space so they can then
  // leave (the server blocks the last owner from leaving/being demoted). It
  // grants full control, so confirm first.
  const confirmMakeOwner = (member: CourseCollaborationMember) => {
    Alert.alert(
      'Make owner',
      `Give ${member.display_name} owner control of this space? They’ll be able to manage members, publish deadlines, and delete the space. You’ll stay an owner too — after this you can leave if you want.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Make owner',
          onPress: () => changeRole.mutate({ memberUserId: member.user_id, role: 'owner' }),
        },
      ],
    );
  };

  if (query.isLoading || !detail) {
    return (
      <SafeAreaView style={[styles.loading, { backgroundColor: colors.paper }]}>
        <ActivityIndicator color={colors.brand} />
      </SafeAreaView>
    );
  }

  const memberName = (userId: string | null) =>
    detail.members.find((member) => member.user_id === userId)?.display_name ?? 'Everyone';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: detail.collaboration.course_name }} />
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}>
        <View style={[styles.hero, { backgroundColor: `${detail.collaboration.course_color}15`, borderColor: `${detail.collaboration.course_color}35` }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: colors.ink }]}>{detail.collaboration.course_name}</Text>
            <Text style={[styles.heroSub, { color: colors.ink3 }]}>
              {detail.members.length} {detail.members.length === 1 ? 'member' : 'members'} · Your role: {me?.role ?? 'member'}
            </Text>
          </View>
          <View style={styles.avatarStack}>
            {detail.members.slice(0, 3).map((member, index) => (
              <View
                key={member.user_id}
                style={[styles.avatar, { backgroundColor: detail.collaboration.course_color, marginLeft: index ? -7 : 0, borderColor: colors.card }]}
              >
                <Text style={styles.avatarText}>{member.display_name.slice(0, 1).toUpperCase()}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.actions}>
          {canEdit && (
            <ActionButton icon="user-plus" label="Invite" onPress={() =>
              inviteClassmates(id, detail.collaboration.course_name)
                .catch((error) => Alert.alert('Couldn’t invite', error.message))
            } />
          )}
          {isOwner && (
            <ActionButton icon="upload" label="Publish" busy={publish.isPending} onPress={() => publish.mutate()} />
          )}
          <ActionButton icon="refresh" label="My planner" busy={sync.isPending} onPress={() => sync.mutate()} />
          {isOwner ? (
            <ActionButton icon="cog" label="Settings" onPress={() => setShowSettings(true)} />
          ) : (
            <ActionButton icon="sign-out" label="Leave" busy={leave.isPending} onPress={confirmLeave} />
          )}
        </View>

        {(sharedDecks.data?.length ?? 0) > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: colors.ink }]}>Shared decks</Text>
            </View>
            <View style={[styles.deckList, { backgroundColor: colors.card, borderColor: colors.line }]}>
              {sharedDecks.data!.map((sharedDeck, index) => (
                <TouchableOpacity
                  key={sharedDeck.id}
                  style={[styles.deckRow, index > 0 && { borderTopWidth: 0.5, borderTopColor: colors.line }]}
                  onPress={() => router.push('/flashcards' as any)}
                  activeOpacity={0.7}
                >
                  <FontAwesome name="clone" size={15} color={colors.brand} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.deckTitle, { color: colors.ink }]}>{sharedDeck.title}</Text>
                    <Text style={[styles.deckMeta, { color: colors.ink3 }]}>
                      {sharedDeck.card_count} {sharedDeck.card_count === 1 ? 'card' : 'cards'}
                      {sharedDeck.created_by === session?.user.id ? ' · shared by you' : ' · copied to your decks'}
                    </Text>
                  </View>
                  <FontAwesome name="chevron-right" size={12} color={colors.ink3} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Group assignments</Text>
          {canEdit && (
            <TouchableOpacity onPress={() => setShowNew(true)} style={[styles.addButton, { backgroundColor: colors.brand50 }]}>
              <FontAwesome name="plus" size={12} color={colors.brand} />
              <Text style={[styles.addText, { color: colors.brand }]}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
        {detail.groupAssignments.length === 0 ? (
          <EmptyCard text="No group assignments yet. Add the first one for the team." />
        ) : detail.groupAssignments.map((assignment) => (
          <View key={assignment.id} style={[styles.item, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <TouchableOpacity
              disabled={!canEdit || toggle.isPending}
              onPress={() => toggle.mutate({ assignmentId: assignment.id, completed: !assignment.is_completed })}
              style={[styles.checkbox, { borderColor: assignment.is_completed ? colors.brand : colors.line, backgroundColor: assignment.is_completed ? colors.brand : 'transparent' }]}
            >
              {assignment.is_completed && <FontAwesome name="check" size={11} color="#fff" />}
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.ink }, assignment.is_completed && styles.done]}>{assignment.title}</Text>
              <Text style={[styles.itemMeta, { color: colors.ink3 }]}>
                {format(new Date(`${assignment.due_date}T${assignment.due_time || '12:00:00'}`), 'MMM d')}
                {assignment.due_time ? ` · ${format(new Date(`${assignment.due_date}T${assignment.due_time}`), 'h:mm a')}` : ''}
                {' · '}{assignment.assigned_to ? memberName(assignment.assigned_to) : 'Everyone'}
              </Text>
            </View>
          </View>
        ))}

        <Text style={[styles.sectionTitle, { color: colors.ink, marginTop: 10 }]}>Shared course deadlines</Text>
        {detail.deadlines.length === 0 ? (
          <EmptyCard text={me?.role === 'owner' ? 'Tap Publish to share your current course deadlines.' : 'The course owner has not published deadlines yet.'} />
        ) : detail.deadlines.map((deadline) => (
          <View key={deadline.id} style={[styles.item, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <View style={[styles.typeIcon, { backgroundColor: `${detail.collaboration.course_color}16` }]}>
              <FontAwesome name="calendar-o" size={14} color={detail.collaboration.course_color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.ink }]}>{deadline.title}</Text>
              <Text style={[styles.itemMeta, { color: colors.ink3 }]}>
                Due {format(new Date(`${deadline.due_date}T${deadline.due_time || '12:00:00'}`), 'MMM d')}
                {deadline.points_possible != null ? ` · ${deadline.points_possible} pts` : ''}
              </Text>
            </View>
          </View>
        ))}

        <Text style={[styles.sectionTitle, { color: colors.ink, marginTop: 10 }]}>Members</Text>
        {detail.members.map((member) => {
          const isSelf = member.user_id === session?.user.id;
          return (
            <View key={member.user_id} style={[styles.item, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <View style={[styles.memberAvatar, { backgroundColor: detail.collaboration.course_color }]}>
                <Text style={styles.avatarText}>{member.display_name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: colors.ink }]}>
                  {member.display_name}{isSelf ? ' (You)' : ''}
                </Text>
                <Text style={[styles.itemMeta, { color: colors.ink3, textTransform: 'capitalize' }]}>{member.role}</Text>
              </View>
              {/* Owners manage everyone but themselves; the last-owner guards live server-side. */}
              {isOwner && !isSelf && (
                <View style={styles.memberActions}>
                  {member.role !== 'owner' && (
                    <>
                      <TouchableOpacity
                        disabled={changeRole.isPending}
                        onPress={() =>
                          changeRole.mutate({
                            memberUserId: member.user_id,
                            role: member.role === 'viewer' ? 'editor' : 'viewer',
                          })
                        }
                        style={[styles.rolePill, { borderColor: colors.line, backgroundColor: colors.brand50 }]}
                      >
                        <FontAwesome name={member.role === 'viewer' ? 'pencil' : 'eye'} size={11} color={colors.brand} />
                        <Text style={[styles.rolePillText, { color: colors.brand }]}>
                          {member.role === 'viewer' ? 'Editor' : 'Viewer'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={changeRole.isPending}
                        onPress={() => confirmMakeOwner(member)}
                        style={[styles.rolePill, { borderColor: colors.line, backgroundColor: colors.brand50 }]}
                      >
                        <FontAwesome name="star" size={11} color={colors.brand} />
                        <Text style={[styles.rolePillText, { color: colors.brand }]}>Owner</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  <TouchableOpacity
                    disabled={removeMember.isPending}
                    onPress={() => confirmRemove(member)}
                    style={[styles.removeButton, { borderColor: colors.line }]}
                  >
                    <FontAwesome name="user-times" size={13} color={colors.coral} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <NewGroupAssignmentModal
        visible={showNew}
        onClose={() => setShowNew(false)}
        collaborationId={id}
        members={detail.members}
        userId={session!.user.id}
        onSaved={() => {
          setShowNew(false);
          query.refetch();
        }}
      />

      {isOwner && (
        <SettingsModal
          visible={showSettings}
          onClose={() => setShowSettings(false)}
          collaborationId={id}
          courseName={detail.collaboration.course_name}
          myLocalCourseId={me?.local_course_id ?? null}
        />
      )}
    </SafeAreaView>
  );
}

function ActionButton({ icon, label, busy, onPress }: { icon: string; label: string; busy?: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity onPress={onPress} disabled={busy} style={[styles.action, { backgroundColor: colors.card, borderColor: colors.line }]}>
      {busy ? <ActivityIndicator size="small" color={colors.brand} /> : <FontAwesome name={icon as any} size={15} color={colors.brand} />}
      <Text style={[styles.actionText, { color: colors.ink2 }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function EmptyCard({ text }: { text: string }) {
  const colors = useColors();
  return (
    <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <Text style={[styles.emptyText, { color: colors.ink3 }]}>{text}</Text>
    </View>
  );
}

function NewGroupAssignmentModal({
  visible,
  onClose,
  collaborationId,
  members,
  userId,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  collaborationId: string;
  members: Array<{ user_id: string; display_name: string }>;
  userId: string;
  onSaved: () => void;
}) {
  const colors = useColors();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [dueTime, setDueTime] = useState<Date | null>(null);
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => {
      if (!title.trim()) throw new Error('Enter a title.');
      if (!dueDate) throw new Error('Choose a due date.');
      return createGroupAssignment({
        collaborationId,
        userId,
        assignedTo,
        title,
        description,
        dueDate: formatLocalDate(dueDate),
        dueTime: dueTime
          ? `${String(dueTime.getHours()).padStart(2, '0')}:${String(dueTime.getMinutes()).padStart(2, '0')}:00`
          : null,
      });
    },
    onSuccess: () => {
      setTitle('');
      setDescription('');
      setDueDate(null);
      setDueTime(null);
      setAssignedTo(null);
      onSaved();
    },
    onError: (error: Error) => Alert.alert('Couldn’t add assignment', error.message),
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>New group assignment</Text>
            <TouchableOpacity onPress={onClose}><FontAwesome name="times" size={18} color={colors.ink3} /></TouchableOpacity>
          </View>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="What needs to get done?"
            placeholderTextColor={colors.ink3}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.paper }]}
          />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Notes (optional)"
            placeholderTextColor={colors.ink3}
            multiline
            style={[styles.input, styles.notes, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.paper }]}
          />
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}><DatePicker value={dueDate} onChange={setDueDate} /></View>
            <View style={{ flex: 1 }}><DatePicker value={dueTime} onChange={setDueTime} onClear={() => setDueTime(null)} mode="time" placeholder="Optional time" /></View>
          </View>
          <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Assign to</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberChips}>
            <MemberChip label="Everyone" selected={!assignedTo} onPress={() => setAssignedTo(null)} />
            {members.map((member) => (
              <MemberChip key={member.user_id} label={member.display_name} selected={assignedTo === member.user_id} onPress={() => setAssignedTo(member.user_id)} />
            ))}
          </ScrollView>
          <TouchableOpacity
            onPress={() => create.mutate()}
            disabled={create.isPending}
            style={[styles.saveButton, { backgroundColor: colors.brand }]}
          >
            {create.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Add for the team</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MemberChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, { borderColor: selected ? colors.brand : colors.line, backgroundColor: selected ? colors.brand50 : colors.paper }]}
    >
      <Text style={[styles.chipText, { color: selected ? colors.brand : colors.ink2 }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SettingsModal({
  visible,
  onClose,
  collaborationId,
  courseName,
  myLocalCourseId,
}: {
  visible: boolean;
  onClose: () => void;
  collaborationId: string;
  courseName: string;
  myLocalCourseId: string | null;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const semesterId = useAppStore((state) => state.selectedSemesterId);
  const { data: courses = [] } = useCourses(semesterId);

  // Only the owner opens this, and only owner-created invites are readable (RLS).
  const invites = useQuery({
    queryKey: ['collaboration-invites', collaborationId],
    queryFn: () => listOutstandingInvites(collaborationId),
    enabled: visible,
  });

  const revoke = useMutation({
    mutationFn: () => revokeCollaborationInvite(collaborationId),
    onSuccess: (count) => {
      invites.refetch();
      Alert.alert('Invites revoked', count === 1 ? 'The outstanding invite link no longer works.' : `${count} invite links no longer work.`);
    },
    onError: (error: Error) => Alert.alert('Couldn’t revoke invites', error.message),
  });
  const linkCourse = useMutation({
    mutationFn: (courseId: string) => setCollaborationLocalCourse(collaborationId, courseId),
    onSuccess: () => {
      Haptics.selectionAsync().catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['collaboration', collaborationId] });
      // Re-sync so shared work lands in the newly linked course.
      if (semesterId) {
        syncCollaborationToPlanner(collaborationId, semesterId)
          .then(() => queryClient.invalidateQueries({ queryKey: ['tasks'] }))
          .catch(() => {});
      }
    },
    onError: (error: Error) => Alert.alert('Couldn’t link course', error.message),
  });
  const archive = useMutation({
    mutationFn: () => archiveCollaboration(collaborationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaborations'] });
      onClose();
      if (router.canGoBack()) router.back();
      else router.replace('/collaboration' as any);
    },
    onError: (error: Error) => Alert.alert('Couldn’t archive space', error.message),
  });
  const remove = useMutation({
    mutationFn: () => deleteCollaboration(collaborationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaborations'] });
      onClose();
      if (router.canGoBack()) router.back();
      else router.replace('/collaboration' as any);
    },
    onError: (error: Error) => Alert.alert('Couldn’t delete space', error.message),
  });

  const outstanding = invites.data ?? [];
  const confirmArchive = () =>
    Alert.alert(
      'Archive space',
      `Archive ${courseName}? It disappears for everyone and outstanding invites stop working. Already-synced planner items stay put.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: () => archive.mutate() },
      ],
    );
  const confirmDelete = () =>
    Alert.alert(
      'Delete space',
      `Permanently delete ${courseName} and all its shared deadlines and group work for everyone? This can’t be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() },
      ],
    );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Space settings</Text>
            <TouchableOpacity onPress={onClose}><FontAwesome name="times" size={18} color={colors.ink3} /></TouchableOpacity>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Link to my course</Text>
          <Text style={[styles.settingHint, { color: colors.ink3 }]}>
            Point synced deadlines and group work at a course you already track.
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberChips}>
            {courses.length === 0 ? (
              <Text style={[styles.settingHint, { color: colors.ink3 }]}>No courses this semester yet.</Text>
            ) : courses.map((course) => (
              <MemberChip
                key={course.id}
                label={course.name}
                selected={myLocalCourseId === course.id}
                onPress={() => linkCourse.mutate(course.id)}
              />
            ))}
          </ScrollView>

          <Text style={[styles.fieldLabel, { color: colors.ink2, marginTop: 6 }]}>Invites</Text>
          <TouchableOpacity
            disabled={revoke.isPending || outstanding.length === 0}
            onPress={() => revoke.mutate()}
            style={[styles.settingRow, { borderColor: colors.line, opacity: outstanding.length === 0 ? 0.5 : 1 }]}
          >
            <FontAwesome name="ban" size={15} color={colors.ink2} />
            <Text style={[styles.settingText, { color: colors.ink }]}>
              {outstanding.length === 0
                ? 'No outstanding invite links'
                : `Revoke ${outstanding.length} outstanding invite${outstanding.length === 1 ? '' : 's'}`}
            </Text>
            {revoke.isPending && <ActivityIndicator size="small" color={colors.brand} />}
          </TouchableOpacity>

          <Text style={[styles.fieldLabel, { color: colors.ink2, marginTop: 6 }]}>Danger zone</Text>
          <TouchableOpacity
            disabled={archive.isPending}
            onPress={confirmArchive}
            style={[styles.settingRow, { borderColor: colors.line }]}
          >
            <FontAwesome name="archive" size={15} color={colors.coral} />
            <Text style={[styles.settingText, { color: colors.coral }]}>Archive space</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={remove.isPending}
            onPress={confirmDelete}
            style={[styles.settingRow, { borderColor: colors.line }]}
          >
            <FontAwesome name="trash" size={15} color={colors.coral} />
            <Text style={[styles.settingText, { color: colors.coral }]}>Delete space permanently</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center', padding: 20, paddingBottom: 50, gap: 10 },
  hero: { borderRadius: 19, borderWidth: StyleSheet.hairlineWidth, padding: 16, flexDirection: 'row', alignItems: 'center' },
  heroTitle: { fontSize: 21, fontFamily: 'Fraunces_700Bold' },
  heroSub: { fontSize: 12, marginTop: 4, textTransform: 'capitalize' },
  avatarStack: { flexDirection: 'row' },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 9, marginVertical: 3 },
  action: { flex: 1, minHeight: 58, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', gap: 5 },
  actionText: { fontSize: 11, fontWeight: '700' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  deckList: { borderWidth: 0.5, borderRadius: 14, overflow: 'hidden' },
  deckRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  deckTitle: { fontSize: 14, fontWeight: '600' },
  deckMeta: { fontSize: 12, marginTop: 2 },
  sectionTitle: { flex: 1, fontSize: 19, fontFamily: 'Fraunces_700Bold' },
  addButton: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, flexDirection: 'row', gap: 6, alignItems: 'center' },
  addText: { fontSize: 12, fontWeight: '800' },
  item: { minHeight: 66, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  typeIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 14, fontWeight: '700' },
  itemMeta: { fontSize: 12, marginTop: 4 },
  done: { textDecorationLine: 'line-through', opacity: 0.55 },
  empty: { borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, padding: 15 },
  emptyText: { fontSize: 13, lineHeight: 19 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center', borderTopLeftRadius: 23, borderTopRightRadius: 23, padding: 20, paddingBottom: 36, gap: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 21, fontFamily: 'Fraunces_700Bold' },
  input: { minHeight: 48, borderRadius: 13, borderWidth: 1.2, paddingHorizontal: 14, fontSize: 15 },
  notes: { minHeight: 78, paddingTop: 12, textAlignVertical: 'top' },
  dateRow: { flexDirection: 'row', gap: 9 },
  fieldLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  memberChips: { gap: 8 },
  chip: { minHeight: 36, borderRadius: 11, borderWidth: 1, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 12, fontWeight: '700' },
  saveButton: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  memberActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rolePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 32, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  rolePillText: { fontSize: 11, fontWeight: '800' },
  removeButton: { width: 34, height: 32, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  settingHint: { fontSize: 12, lineHeight: 17 },
  settingRow: { minHeight: 50, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingText: { flex: 1, fontSize: 14, fontWeight: '700' },
});
