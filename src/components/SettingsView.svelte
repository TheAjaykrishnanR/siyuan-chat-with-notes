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
        debugMode: false,
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

<div class="flex flex-col h-full bg-transparent overflow-hidden font-sans">
    <header class="flex items-center justify-between px-6 py-4 glass-effect shrink-0">
        <div class="flex items-center gap-3">
            <div class="p-2 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full text-white shadow-lg">
                <Settings size={20} />
            </div>
            <h2 class="text-lg font-bold gemini-gradient-text tracking-tight">AI Configuration</h2>
        </div>
        <button 
            class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-red-500/10 text-gray-500 hover:text-red-500 transition-all cursor-pointer hover:scale-110 active:scale-90"
            on:click={() => dispatch('close')}
        >
            <X size={20} strokeWidth={2.5} />
        </button>
    </header>

    <div class="flex-1 flex overflow-hidden">
        <!-- Vertical Tab Navigation -->
        <nav class="w-48 glass-effect border-r border-white/5 flex flex-col py-4 px-3 gap-1 overflow-y-auto custom-scrollbar">
            <div class="px-3 py-2 mb-2">
                <span class="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Providers</span>
            </div>
            {#each providers as p}
                <button 
                    class="w-full px-4 py-3 text-sm font-semibold text-left rounded-2xl transition-all cursor-pointer flex items-center justify-between group
                    {activeTab === p.id 
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                        : 'text-gray-600 dark:text-gray-400 hover:bg-blue-500/10 hover:text-blue-500'}"
                    on:click={() => { activeTab = p.id; autoSave(); }}
                >
                    <span>{p.name}</span>
                    {#if activeTab === p.id}
                        <div class="size-2 rounded-full bg-white animate-pulse"></div>
                    {/if}
                </button>
            {/each}

            <div class="px-3 py-2 mt-auto mb-2 border-t border-white/5 pt-4">
                <span class="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] block mb-3">Debug</span>
                <label class="flex items-center justify-between cursor-pointer group">
                    <span class="text-xs font-semibold text-gray-600 dark:text-gray-400 group-hover:text-blue-500 transition-colors">Debug Mode</span>
                    <div class="relative inline-flex items-center">
                        <input type="checkbox" bind:checked={settings.debugMode} class="sr-only peer" on:change={autoSave}>
                        <div class="w-8 h-4 bg-gray-200 peer-focus:outline-none dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600 rounded-full"></div>
                    </div>
                </label>
            </div>
        </nav>

        <!-- Content Area -->
        <main class="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <div class="max-w-2xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500" key={activeTab}>
                <!-- API Key Section -->
                <div class="space-y-4">
                    <div class="flex items-center justify-between">
                        <label class="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Key size={14} class="text-blue-500" />
                            {activeTab} API Key
                        </label>
                    </div>
                    <div class="flex gap-3">
                        <input 
                            type="password" 
                            bind:value={settings.keys[activeTab]}
                            on:input={autoSave}
                            placeholder={`Paste your ${activeTab} key here...`}
                            class="flex-1 px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all font-mono"
                        />
                        <button 
                            class="px-5 rounded-2xl glass-effect hover:bg-blue-500/10 text-blue-500 transition-all flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 shadow-md"
                            on:click={() => refreshModels(activeTab)}
                            title="Fetch Models"
                            disabled={isFetching[activeTab]}
                        >
                            <RefreshCcw size={20} class={isFetching[activeTab] ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                <!-- Model Selection Section -->
                <div class="space-y-6">
                    <label class="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2">
                        <Cpu size={14} class="text-purple-500" />
                        Default Model for {activeTab}
                    </label>
                    
                    {#if availableModels[activeTab].length === 0 && !isFetching[activeTab]}
                        <div class="p-12 glass-effect border-dashed border-2 border-white/10 rounded-[32px] flex flex-col items-center justify-center text-center gap-6 group hover:border-blue-500/30 transition-all">
                            <div class="p-6 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-full text-blue-500/30 group-hover:scale-110 group-hover:text-blue-500 transition-all duration-500">
                                <RefreshCcw size={40} />
                            </div>
                            <p class="text-sm text-gray-400 dark:text-gray-500 font-medium leading-relaxed">Click the refresh button next to your API key<br/><span class="text-blue-500/50">to discover available models for {activeTab}.</span></p>
                        </div>
                    {:else if isFetching[activeTab]}
                        <div class="space-y-3">
                            {#each Array(4) as _}
                                <div class="h-14 w-full bg-white/5 animate-pulse rounded-2xl"></div>
                            {/each}
                        </div>
                    {:else}
                        <div class="grid gap-3">
                            {#each availableModels[activeTab] as model}
                                <button 
                                    class="w-full px-6 py-4 rounded-2xl border transition-all flex items-center justify-between group cursor-pointer
                                    {settings.models[activeTab] === model 
                                        ? 'bg-gradient-to-r from-blue-600/10 to-purple-600/10 border-blue-500 shadow-lg shadow-blue-500/5' 
                                        : 'bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/10'}"
                                    on:click={() => { settings.models[activeTab] = model; autoSave(); }}
                                >
                                    <span class="text-sm font-bold {settings.models[activeTab] === model ? 'text-blue-500' : 'text-gray-600 dark:text-gray-300'} truncate">{model}</span>
                                    {#if settings.models[activeTab] === model}
                                        <div class="size-2.5 rounded-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.8)] animate-pulse"></div>
                                    {:else}
                                        <ChevronRight size={16} class="text-gray-400 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                                    {/if}
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
        </main>
    </div>

    <footer class="p-4 glass-effect border-t border-white/5 text-center">
        <span class="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-[0.3em]">Cloud-Sync: Changes are saved instantly</span>
    </footer>
</div>
