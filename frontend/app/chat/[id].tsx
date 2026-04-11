import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, KeyboardAvoidingView, Platform, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { useAuth } from '../../src/auth';
import { getMessages, sendMessage } from '../../src/api';
import { supabase } from '../../src/lib/supabase';
import { useIsBlocked, useUnblockUser } from '../../src/hooks/useBlocking';
import type { ChatMessage } from '../../src/types/api';

export default function ChatScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const { id, type, receiverId, title } = useLocalSearchParams<{ id: string, type: 'mission' | 'emergency', receiverId: string, title?: string }>();
    const { user } = useAuth();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const flatListRef = useRef<FlatList>(null);
    const { data: isBlocked } = useIsBlocked(receiverId!);
    const unblockMutation = useUnblockUser();

    useEffect(() => {
        loadMessages();

        // Subscribe to new messages
        const subscription = supabase
            .channel('public:messages')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: type === 'mission' ? `mission_id=eq.${id}` : `emergency_id=eq.${id}`
            }, payload => {
                setMessages(prev => [...prev, payload.new as ChatMessage]);
                setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
            })
            .subscribe();

        return () => { supabase.removeChannel(subscription); };
    }, [id, type]);

    const loadMessages = async () => {
        try {
            const data = await getMessages(type === 'mission' ? id : undefined, type === 'emergency' ? id : undefined);
            setMessages(data);
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200);
        } catch (e) {
            console.error(e);
        }
    };

    const handleSend = async () => {
        if (!inputText.trim() || isBlocked) return;
        const textToSend = inputText.trim();
        setInputText('');
        try {
            await sendMessage(
                textToSend,
                receiverId as string,
                type === 'mission' ? id : undefined,
                type === 'emergency' ? id : undefined
            );
        } catch (e) {
            console.error(e);
            setInputText(textToSend); // Restore if failed
        }
    };

    const renderItem = ({ item }: { item: { id: string; sender_id: string; content: string; created_at: string } }) => {
        const isMe = item.sender_id === user?.id;
        return (
            <View style={[styles.messageWrapper, isMe ? styles.messageWrapperRight : styles.messageWrapperLeft]}>
                <View style={[styles.messageBubble, isMe ? styles.messageBubbleRight : styles.messageBubbleLeft]}>
                    <Text style={[styles.messageText, isMe ? styles.messageTextRight : styles.messageTextLeft]}>
                        {item.content}
                    </Text>
                </View>
                <Text style={styles.timeText}>
                    {new Date(item.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{title || t('chat.default_title')}</Text>
                <View style={{ width: 44 }} />
            </View>

            <KeyboardAvoidingView
                style={styles.content}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                {isBlocked && (
                    <View style={styles.blockedBanner}>
                        <Ionicons name="ban" size={18} color={COLORS.urgency} />
                        <Text style={styles.blockedBannerText}>{t('blocking.user_blocked_banner')}</Text>
                        <TouchableOpacity
                            style={styles.unblockBtn}
                            onPress={() => unblockMutation.mutate(receiverId!)}
                            disabled={unblockMutation.isPending}
                        >
                            <Text style={styles.unblockBtnText}>{t('blocking.unblock')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
                />

                <View style={styles.inputContainer}>
                    <TextInput
                        style={[styles.input, isBlocked && { opacity: 0.5 }]}
                        placeholder={isBlocked ? t('blocking.input_disabled') : t('chat.input_placeholder')}
                        value={inputText}
                        onChangeText={setInputText}
                        multiline
                        maxLength={500}
                        editable={!isBlocked}
                    />
                    <TouchableOpacity
                        style={[styles.sendBtn, (!inputText.trim() || isBlocked) && { opacity: 0.5 }]}
                        onPress={handleSend}
                        disabled={!inputText.trim() || !!isBlocked}
                    >
                        <Ionicons name="send" size={20} color={COLORS.textInverse} />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
    backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.paper, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
    headerTitle: { ...FONTS.h3, color: COLORS.textPrimary },
    content: { flex: 1 },
    listContent: { padding: SPACING.md, paddingBottom: SPACING.xxl },
    messageWrapper: { marginBottom: SPACING.md, maxWidth: '80%' },
    messageWrapperLeft: { alignSelf: 'flex-start' },
    messageWrapperRight: { alignSelf: 'flex-end', alignItems: 'flex-end' },
    messageBubble: { padding: SPACING.md, borderRadius: RADIUS.lg },
    messageBubbleLeft: { backgroundColor: COLORS.paper, borderBottomLeftRadius: 4, ...SHADOWS.card },
    messageBubbleRight: { backgroundColor: COLORS.brandPrimary, borderBottomRightRadius: 4, ...SHADOWS.float },
    messageText: { ...FONTS.body },
    messageTextLeft: { color: COLORS.textPrimary },
    messageTextRight: { color: COLORS.textInverse },
    timeText: { ...FONTS.caption, color: COLORS.textTertiary, marginTop: 4, fontSize: 10 },
    inputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: SPACING.md, backgroundColor: COLORS.paper, borderTopWidth: 1, borderTopColor: COLORS.border },
    input: { flex: 1, backgroundColor: COLORS.background, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 12, minHeight: 44, maxHeight: 100, ...FONTS.body, color: COLORS.textPrimary, marginRight: SPACING.md },
    sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.brandPrimary, justifyContent: 'center', alignItems: 'center' },
    blockedBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, gap: SPACING.sm, borderBottomWidth: 1, borderBottomColor: '#FECACA' },
    blockedBannerText: { ...FONTS.bodySmall, color: COLORS.urgency, flex: 1 },
    unblockBtn: { backgroundColor: COLORS.paper, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
    unblockBtnText: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '600' as const },
});
