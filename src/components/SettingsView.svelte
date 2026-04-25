<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';
    import { X, Key, Globe, Cpu, RefreshCcw, Check, ChevronRight, Settings } from 'lucide-svelte';
    import { fetchModels } from '../api/ai';
    import { showMessage } from 'siyuan';

    export let plugin: any;
    
    const dispatch = createEventDispatcher();
    
    // Initialize complex settings structure if not exists
    let settings = { 
        provider: 'openai',
        keys: { openai: '', anthropic: '', gemini: '', deepseek: '' },
        models: { openai: '', anthropic: '', gemini: '', deepseek: '' },
        ...plugin.data['chat-settings'] 
    };

    if (!settings.models) {
        settings.models = {
            openai: settings.model || '',
            anthropic: settings.provider === 'anthropic' ? settings.model : '',
            gemini: settings.provider === 'gemini' ? settings.model : '',
            deepseek: settings.provider === 'deepseek' ? settings.model : ''
        };
    }

    let activeTab = settings.provider;
    let availableModels: Record<string, string[]> = {
        openai: [],
        anthropic: [],
        gemini: [],
        deepseek: []
    };
    let isFetching: Record<string, boolean> = {
        openai: false,
        anthropic: false,
        gemini: false,
        deepseek: false
    };

    // Auto-save whenever settings change
    $: {
        if (settings) {
            autoSave();
        }
    }

    async function autoSave() {
        // Sync active provider and its model to the top-level keys
        settings.provider = activeTab;
        settings.model = settings.models[activeTab];
        
        plugin.data['chat-settings'] = { ...settings };
        await plugin.saveData('chat-settings', plugin.data['chat-settings']);
    }

    onMount(async () => {
        // Pre-fetch models for the active tab if key exists
        if (settings.keys[activeTab]) {
            await refreshModels(activeTab);
        }
    });

    async function refreshModels(provider: string) {
        const apiKey = settings.keys[provider];
        if (!apiKey) {
            showMessage(`Please enter an API key for ${provider}`);
            return;
        }

        isFetching[provider] = true;
        try {
            const models = await fetchModels(provider, apiKey);
            availableModels[provider] = models;
            if (models.length > 0 && !settings.models[provider]) {
                settings.models[provider] = models[0];
            }
        } catch (e) {
            showMessage(`Error fetching ${provider} models: ${e.message}`);
        } finally {
            isFetching[provider] = false;
        }
    }

    const providers = [
        { id: 'openai', name: 'OpenAI' },
        { id: 'anthropic', name: 'Anthropic' },
        { id: 'gemini', name: 'Gemini' },
        { id: 'deepseek', name: 'DeepSeek' }
    ];
</script>

<div class="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden font-sans">
    <header class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div class="flex items-center gap-2">
            <Settings class="text-gray-500" size={18} />
            <h2 class="text-base font-semibold text-gray-800 dark:text-gray-100">AI Configuration</h2>
        </div>
        <button 
            class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors cursor-pointer"
            on:click={() => dispatch('close')}
        >
            <X size={18} />
        </button>
    </header>

    <div class="flex-1 flex overflow-hidden">
        <!-- Vertical Tab Navigation -->
        <nav class="w-40 border-r border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-850/50 flex flex-col py-2 px-2 gap-1 overflow-y-auto">
            <div class="px-3 py-2 mb-1">
                <span class="text-xs font-medium text-gray-400">Providers</span>
            </div>
            {#each providers as p}
                <button 
                    class="w-full px-3 py-2.5 text-sm font-normal text-left rounded-xl transition-all cursor-pointer flex items-center justify-between group
                    {activeTab === p.id 
                        ? 'bg-white dark:bg-gray-800 text-black dark:text-white shadow-sm ring-1 ring-gray-200 dark:ring-gray-700' 
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/50'}"
                    on:click={() => { activeTab = p.id; autoSave(); }}
                >
                    <span>{p.name}</span>
                    {#if activeTab === p.id}
                        <div class="size-1.5 rounded-full bg-blue-500"></div>
                    {/if}
                </button>
            {/each}
        </nav>

        <!-- Content Area -->
        <main class="flex-1 overflow-y-auto p-6 bg-white dark:bg-gray-900">
            <div class="max-w-xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300" key={activeTab}>
                <!-- API Key Section -->
                <div class="space-y-3">
                    <div class="flex items-center justify-between">
                        <label class="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Key size={12} />
                            {activeTab} API Key
                        </label>
                    </div>
                    <div class="flex gap-2">
                        <input 
                            type="password" 
                            bind:value={settings.keys[activeTab]}
                            on:input={autoSave}
                            placeholder={`Paste your ${activeTab} key here...`}
                            class="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        />
                        <button 
                            class="px-4 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-all flex items-center justify-center cursor-pointer border border-transparent"
                            on:click={() => refreshModels(activeTab)}
                            title="Fetch Models"
                            disabled={isFetching[activeTab]}
                        >
                            <RefreshCcw size={18} class={isFetching[activeTab] ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                <!-- Model Selection Section -->
                <div class="space-y-4">
                    <label class="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <Cpu size={12} />
                        Default Model for {activeTab}
                    </label>
                    
                    {#if availableModels[activeTab].length === 0 && !isFetching[activeTab]}
                        <div class="p-10 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-3xl flex flex-col items-center justify-center text-center gap-4 group hover:border-gray-200 dark:hover:border-gray-700 transition-colors">
                            <div class="p-4 bg-gray-50 dark:bg-gray-850 rounded-full text-gray-300 group-hover:scale-110 transition-transform">
                                <RefreshCcw size={28} />
                            </div>
                            <p class="text-xs text-gray-400 leading-relaxed">Click the refresh button next to your API key<br/>to load the available models from {activeTab}.</p>
                        </div>
                    {:else if isFetching[activeTab]}
                        <div class="space-y-2.5">
                            {#each Array(4) as _}
                                <div class="h-12 w-full bg-gray-50 dark:bg-gray-850 animate-pulse rounded-xl"></div>
                            {/each}
                        </div>
                    {:else}
                        <div class="grid gap-2">
                            {#each availableModels[activeTab] as model}
                                <button 
                                    class="w-full px-5 py-3.5 rounded-xl border text-left text-sm transition-all flex items-center justify-between group cursor-pointer
                                    {settings.models[activeTab] === model 
                                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/20' 
                                        : 'bg-transparent border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'}"
                                    on:click={() => { settings.models[activeTab] = model; autoSave(); }}
                                >
                                    <span class="font-medium truncate">{model}</span>
                                    {#if settings.models[activeTab] === model}
                                        <div class="size-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                                    {:else}
                                        <ChevronRight size={14} class="text-gray-300 opacity-0 group-hover:opacity-100 transition-all translate-x-[-4px] group-hover:translate-x-0" />
                                    {/if}
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
        </main>
    </div>

    <footer class="p-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/10 dark:bg-gray-850/10 shrink-0 text-center">
        <span class="text-[10px] text-gray-400 font-medium uppercase tracking-widest">Settings are saved automatically</span>
    </footer>
</div>
