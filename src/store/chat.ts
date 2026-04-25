import { writable, get } from 'svelte/store';
import { removeDoc } from '../api/siyuan';

export interface IMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    references?: { id: string, title: string }[];
    images?: string[]; // base64 strings
}

export interface IConversation {
    id: string;
    title: string;
    messages: IMessage[];
    updatedAt: number;
    siyuanPath?: string;
    siyuanNotebookId?: string;
}

export const conversations = writable<IConversation[]>([]);
export const currentConversationId = writable<string | null>(null);

export function createNewConversation() {
    const newConv: IConversation = {
        id: crypto.randomUUID(),
        title: 'New Chat',
        messages: [],
        updatedAt: Date.now()
    };
    conversations.update(convs => [newConv, ...convs]);
    currentConversationId.set(newConv.id);
    return newConv;
}

export function addMessageToCurrent(message: IMessage) {
    const id = get(currentConversationId);
    if (!id) return;

    conversations.update(convs => {
        return convs.map(c => {
            if (c.id === id) {
                const updated = {
                    ...c,
                    messages: [...c.messages, message],
                    updatedAt: Date.now()
                };
                // Auto title if first message
                if (updated.messages.length === 1 && message.role === 'user') {
                    updated.title = message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '');
                }
                return updated;
            }
            return c;
        });
    });
}

export function appendChunkToCurrent(chunk: string) {
    const id = get(currentConversationId);
    if (!id) return;

    conversations.update(convs => {
        const newConvs = [...convs];
        const index = newConvs.findIndex(c => c.id === id);
        if (index !== -1) {
            const messages = [...newConvs[index].messages];
            if (messages.length > 0) {
                const lastIdx = messages.length - 1;
                messages[lastIdx] = {
                    ...messages[lastIdx],
                    content: messages[lastIdx].content + chunk
                };
                newConvs[index] = {
                    ...newConvs[index],
                    messages: messages,
                    updatedAt: Date.now()
                };
            }
        }
        return newConvs;
    });
}

export function replaceLastMessageWithAssistant() {
    const id = get(currentConversationId);
    if (!id) return;

    conversations.update(convs => {
        return convs.map(c => {
            if (c.id === id) {
                const newMessages = [...c.messages];
                if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                    newMessages[newMessages.length - 1] = {
                        role: 'assistant',
                        content: ''
                    };
                } else {
                    newMessages.push({
                        role: 'assistant',
                        content: ''
                    });
                }
                return {
                    ...c,
                    messages: newMessages,
                    updatedAt: Date.now()
                };
            }
            return c;
        });
    });
}

export function deleteConversation(id: string) {
    let notebookId = '';
    let path = '';
    
    conversations.update(convs => {
        const conv = convs.find(c => c.id === id);
        if (conv && conv.siyuanNotebookId && conv.siyuanPath) {
            notebookId = conv.siyuanNotebookId;
            path = conv.siyuanPath;
        }
        return convs.filter(c => c.id !== id);
    });

    if (notebookId && path) {
        removeDoc(notebookId, path).catch(console.error);
    }

    if (get(currentConversationId) === id) {
        const remaining = get(conversations);
        if (remaining.length > 0) {
            currentConversationId.set(remaining[0].id);
        } else {
            currentConversationId.set(null);
            createNewConversation();
        }
    }
}

export function deleteMessage(convId: string, messageIndex: number) {
    conversations.update(convs => {
        return convs.map(c => {
            if (c.id === convId) {
                const newMessages = [...c.messages];
                newMessages.splice(messageIndex, 1);
                return {
                    ...c,
                    messages: newMessages,
                    updatedAt: Date.now()
                };
            }
            return c;
        });
    });
}
