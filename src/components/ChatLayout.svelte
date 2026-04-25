<script lang="ts">
    import { onMount } from 'svelte';
    import Sidebar from './Sidebar.svelte';
    import MessageList from './MessageList.svelte';
    import InputBox from './InputBox.svelte';
    import SettingsView from './SettingsView.svelte';
    import { conversations, currentConversationId, addMessageToCurrent, appendChunkToCurrent, replaceLastMessageWithAssistant, createNewConversation } from '../store/chat';
    import { streamMessage, fetchModels } from '../api/ai';
    import { getBlockMarkdown, getNotebooks, createDoc } from '../api/siyuan';
    import { PanelLeftClose, PanelLeftOpen, ChevronDown, Square } from 'lucide-svelte';

    export let plugin: any;
    
    let showSidebar = false;
    let isLoading = false;
    let showModelPicker = false;
    let availableModels: string[] = [];
    let abortController: AbortController | null = null;
    let currentView: 'chat' | 'settings' = 'chat';

    $: currentConv = $conversations.find(c => c.id === $currentConversationId);

    onMount(async () => {
        if ($conversations.length === 0) {
            createNewConversation();
        }
        await loadModels();
    });

    async function loadModels() {
        const config = plugin.data['chat-settings'];
        const apiKey = config.keys?.[config.provider];
        if (apiKey) {
            availableModels = await fetchModels(config.provider, apiKey);
        }
    }

    async function selectModel(model: string) {
        plugin.data['chat-settings'].model = model;
        await plugin.saveData('chat-settings', plugin.data['chat-settings']);
        showModelPicker = false;
    }

    function stopResponse() {
        if (abortController) {
            abortController.abort();
            abortController = null;
            isLoading = false;
        }
    }

    async function handleRegenerate() {
        if (isLoading || !currentConv) return;
        
        const userMessages = currentConv.messages.filter(m => m.role === 'user');
        if (userMessages.length === 0) return;
        
        const lastUserMsg = userMessages[userMessages.length - 1];
        replaceLastMessageWithAssistant();
        await performSend(lastUserMsg.content, lastUserMsg.references || [], lastUserMsg.images || []);
    }

    async function handleSend(event: CustomEvent) {
        const { content, references, images } = event.detail;
        if (isLoading) return;

        addMessageToCurrent({
            role: 'user',
            content,
            references,
            images
        });

        addMessageToCurrent({
            role: 'assistant',
            content: ''
        });

        await performSend(content, references, images);
    }

    async function syncToSiYuan() {
        if (!currentConv || currentConv.messages.length < 2) return;

        try {
            const notebooks = await getNotebooks();
            if (notebooks.length === 0) return;

            const notebookId = currentConv.siyuanNotebookId || notebooks[0].id;
            const safeTitle = currentConv.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 50);
            const docPath = currentConv.siyuanPath || `/AI Chats/${safeTitle}-${currentConv.id.slice(0, 8)}`;

            let markdown = `# ${currentConv.title}\n\n`;
            markdown += `Last updated: ${new Date().toLocaleString()}\n\n---\n\n`;
            
            currentConv.messages.forEach(m => {
                if (m.content) {
                    markdown += `### ${m.role === 'user' ? 'You' : 'Assistant'}\n\n${m.content}\n\n`;
                    if (m.images && m.images.length > 0) {
                        markdown += `*(Attached ${m.images.length} images)*\n\n`;
                    }
                    if (m.references && m.references.length > 0) {
                        markdown += `**References:** ${m.references.map(r => `[[${r.title}]]`).join(', ')}\n\n`;
                    }
                    markdown += `---\n\n`;
                }
            });

            const result = await createDoc(notebookId, docPath, markdown);
            if (result && !currentConv.siyuanPath) {
                conversations.update(convs => convs.map(c => {
                    if (c.id === currentConv!.id) {
                        return { ...c, siyuanPath: docPath, siyuanNotebookId: notebookId };
                    }
                    return c;
                }));
            }
        } catch (e) {
            console.error("Failed to auto-sync to SiYuan:", e);
        }
    }

    async function performSend(content: string, references: any[], images: string[]) {
        isLoading = true;
        abortController = new AbortController();

        try {
            let context = '';
            for (const ref of references) {
                const md = await getBlockMarkdown(ref.id);
                context += `\n\n--- Content from Note: ${ref.title} ---\n${md}\n--- End of Note ---\n`;
            }

            const config = plugin.data['chat-settings'];
            const apiConfig = {
                provider: config.provider,
                model: config.model,
                apiKey: config.keys?.[config.provider] || ""
            };
            
            if (!apiConfig.apiKey) {
                throw new Error(`API key for ${apiConfig.provider} not found. Please add it in settings.`);
            }

            const messages = [
                { role: 'system', content: 'You are a helpful assistant. You will be provided with context from the user\'s notes. Use this context to answer their questions accurately. Be concise but thorough.' },
                ...(currentConv?.messages.slice(0, -1).map(m => ({ 
                    role: m.role, 
                    content: m.content,
                    images: m.images 
                })) || []),
                { 
                    role: 'user', 
                    content: context + "\n\nUser Question: " + content,
                    images: images
                }
            ];

            const stream = streamMessage(apiConfig, messages, abortController.signal);
            for await (const chunk of stream) {
                appendChunkToCurrent(chunk);
            }

            await syncToSiYuan();

        } catch (error: any) {
            if (error.name === 'AbortError') {
                appendChunkToCurrent(`\n\n*Response stopped by user.*`);
            } else {
                appendChunkToCurrent(`\n\n**Error:** ${error.message}`);
            }
        } finally {
            isLoading = false;
            abortController = null;
        }
    }
</script>

<div class="flex h-full w-full bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 overflow-hidden font-sans relative" on:click={() => showModelPicker = false}>
    
    {#if currentView === 'settings'}
        <SettingsView {plugin} on:close={() => { currentView = 'chat'; loadModels(); }} />
    {:else}
        {#if showSidebar}
            <!-- Backdrop -->
            <div 
                class="absolute inset-0 bg-black/20 dark:bg-black/40 z-10"
                on:click={() => showSidebar = false}
            ></div>
            
            <!-- Sidebar Container -->
            <div class="absolute top-0 bottom-0 left-0 z-20 shadow-2xl">
                <Sidebar {plugin} i18n={plugin.i18n} on:close={() => showSidebar = false} on:openSettings={() => { currentView = 'settings'; showSidebar = false; }} />
            </div>
        {/if}

        <div class="flex-1 flex flex-col h-full relative min-w-0">
            <!-- Header with model selector and sidebar toggle inline -->
            <header class="flex items-center justify-between px-2 py-2 bg-white dark:bg-gray-900 z-1 sticky top-0 border-b border-transparent">
                <div class="flex items-center w-12">
                    {#if !showSidebar}
                        <button 
                            class="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-850 text-gray-500 dark:text-gray-400 transition-colors cursor-pointer"
                            on:click|stopPropagation={() => showSidebar = true}
                            title="Open Sidebar"
                        >
                            <PanelLeftOpen size={20} strokeWidth={1.5} />
                        </button>
                    {/if}
                </div>
                
                <div class="relative">
                    <button 
                        class="font-medium text-lg flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-850 px-3 py-1.5 rounded-xl transition-colors border-none bg-transparent"
                        on:click|stopPropagation={() => { showModelPicker = !showModelPicker; if(showModelPicker) loadModels(); }}
                    >
                        {plugin.data['chat-settings']?.model || 'AI Chat'}
                        <ChevronDown size={14} class="text-gray-400 transition-transform {showModelPicker ? 'rotate-180' : ''}" />
                    </button>

                    {#if showModelPicker}
                        <div class="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-2xl py-2 z-50 min-w-[200px] max-h-[400px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                            <div class="px-4 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50/50 dark:bg-gray-850/50 mb-1">
                                Available Models
                            </div>
                            {#if availableModels.length === 0}
                                <div class="px-4 py-2 text-sm text-gray-500 italic">No models found. Check API key.</div>
                            {:else}
                                {#each availableModels as model}
                                    <button 
                                        class="w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center justify-between gap-4 cursor-pointer {plugin.data['chat-settings'].model === model ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}"
                                        on:click={() => selectModel(model)}
                                    >
                                        <span class="truncate">{model}</span>
                                        {#if plugin.data['chat-settings'].model === model}
                                            <div class="size-1.5 rounded-full bg-current"></div>
                                        {/if}
                                    </button>
                                {/each}
                            {/if}
                        </div>
                    {/if}
                </div>
                
                <div class="w-12"></div> <!-- Spacer for centering -->
            </header>

            <div class="flex-1 overflow-hidden relative flex flex-col items-center w-full">
                <MessageList messages={currentConv?.messages || []} {isLoading} on:regenerate={handleRegenerate} />
            </div>

            <div class="w-full flex flex-col items-center bg-white dark:bg-gray-900 pt-2 pb-6 z-1">
                {#if isLoading}
                    <button 
                        class="mb-3 flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-850 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-all shadow-sm cursor-pointer animate-in fade-in slide-in-from-bottom-2"
                        on:click={stopResponse}
                    >
                        <Square size={12} fill="currentColor" />
                        Stop Response
                    </button>
                {/if}
                <InputBox i18n={plugin.i18n} on:send={handleSend} />
            </div>
        </div>
    {/if}
</div>
