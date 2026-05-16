<script lang="ts">
    import { onMount } from 'svelte';
    import { fly, fade } from 'svelte/transition';
    import Sidebar from './Sidebar.svelte';
    import MessageList from './MessageList.svelte';
    import InputBox from './InputBox.svelte';
    import SettingsView from './SettingsView.svelte';
    import { conversations, currentConversationId, addMessageToCurrent, appendChunkToCurrent, replaceLastMessageWithAssistant, createNewConversation } from '../store/chat';
    import { streamMessage, fetchModels } from '../api/ai';
    import { getBlockMarkdown, getNotebooks, createDoc } from '../api/siyuan';
    import { PanelLeftOpen, ChevronDown, Menu, X } from 'lucide-svelte';

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
                { role: 'system', content: "You are a helpful assistant. You will be provided with context from the user's notes. Use this context to answer their questions accurately. Be concise but thorough. Use LaTeX for ALL mathematical equations and scientific notation, using $...$ for inline and $$...$$ for block equations. For example, use $\\nabla \\cdot E = \\frac{\\rho}{\\epsilon_0}$ instead of Unicode symbols." },
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

<div class="flex h-full w-full gemini-bg text-gray-800 dark:text-gray-100 overflow-hidden font-sans relative" on:click={() => showModelPicker = false}>
    
    {#if currentView === 'settings'}
        <div class="absolute inset-0 z-50 glass-effect-strong animate-in fade-in duration-300">
            <SettingsView {plugin} on:close={() => { currentView = 'chat'; loadModels(); }} />
        </div>
    {:else}
        {#if showSidebar}
            <!-- Backdrop -->
            <div 
                class="absolute inset-0 bg-black/10 dark:bg-black/30 backdrop-blur-sm z-30"
                on:click={() => showSidebar = false}
                transition:fade={{ duration: 200 }}
            ></div>
            
            <!-- Sidebar Container -->
            <div class="absolute top-0 bottom-0 left-0 z-40 shadow-2xl"
                transition:fly={{ x: -320, duration: 250 }}
            >
                <Sidebar {plugin} i18n={plugin.i18n} on:close={() => showSidebar = false} on:openSettings={() => { currentView = 'settings'; showSidebar = false; }} />
            </div>
        {/if}

        <div class="flex-1 flex flex-col h-full relative min-w-0">
            <!-- Header with model selector and sidebar toggle inline -->
            <header class="flex items-center gap-3 px-3 py-2 glass-effect sticky top-0 z-30 transition-all duration-300">
                <div class="flex items-center gap-2">
                    <button 
                        class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-500/10 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 transition-all cursor-pointer hover:scale-110 active:scale-95 group relative z-50"
                        on:click|stopPropagation={() => showSidebar = !showSidebar}
                        title={showSidebar ? "Close Sidebar" : "Open Sidebar"}
                    >
                        {#if showSidebar}
                            <X size={18} strokeWidth={1.5} class="group-hover:text-red-500 transition-colors" />
                        {:else}
                            <Menu size={18} strokeWidth={1.5} class="group-hover:text-blue-500 transition-colors" />
                        {/if}
                    </button>

                    <div class="relative">
                        <button 
                            class="font-semibold text-sm flex items-center gap-1.5 cursor-pointer hover:bg-white/40 dark:hover:bg-gray-800/40 px-3 py-1.5 rounded-full transition-all border-none bg-transparent gemini-gradient-text"
                            on:click|stopPropagation={() => { showModelPicker = !showModelPicker; if(showModelPicker) loadModels(); }}
                        >
                            {plugin.data['chat-settings']?.model || 'AI Chat'}
                            <ChevronDown size={12} class="text-blue-500/70 transition-transform {showModelPicker ? 'rotate-180' : ''}" />
                        </button>

                        {#if showModelPicker}
                            <div class="absolute top-full left-0 mt-2 glass-effect-strong rounded-2xl p-1.5 z-50 min-w-[240px] max-h-[400px] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
                                <div class="px-4 py-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">
                                    Available Models
                                </div>
                                {#if availableModels.length === 0}
                                    <div class="px-4 py-4 text-sm text-gray-500 italic text-center">No models found. Check API key.</div>
                                {:else}
                                    {#each availableModels as model}
                                        <button 
                                            class="w-full px-4 py-2.5 rounded-xl text-left text-sm transition-all flex items-center justify-between gap-4 cursor-pointer {plugin.data['chat-settings'].model === model ? 'bg-blue-500/10 text-blue-600 dark:text-blue-300 font-medium' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}"
                                            on:click={() => selectModel(model)}
                                        >
                                            <span class="truncate">{model}</span>
                                            {#if plugin.data['chat-settings'].model === model}
                                                <div class="size-2 rounded-full bg-blue-500"></div>
                                            {/if}
                                        </button>
                                    {/each}
                                {/if}
                            </div>
                        {/if}
                    </div>
                </div>
            </header>

            <div class="flex-1 overflow-hidden relative flex flex-col items-center w-full">
                <MessageList 
                    messages={currentConv?.messages || []} 
                    {isLoading} 
                    on:regenerate={handleRegenerate} 
                    debugMode={plugin.data['chat-settings']?.debugMode}
                />
            </div>

            <div class="w-full flex flex-col items-center bg-transparent pt-2 pb-2 z-10 relative">
                <div class="w-full max-w-4xl px-4">
                    <InputBox i18n={plugin.i18n} on:send={handleSend} {isLoading} onStop={stopResponse} />
                </div>
            </div>
        </div>
    {/if}
</div>
