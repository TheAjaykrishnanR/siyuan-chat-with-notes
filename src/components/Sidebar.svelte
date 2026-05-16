<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';
    import { conversations, currentConversationId, createNewConversation, deleteConversation } from '../store/chat';
    import type { IConversation } from '../store/chat';
    import { Plus, Search, MessageSquare, MoreHorizontal, Trash2, Settings, FileDown, Download, X } from 'lucide-svelte';
    import { createDoc, getNotebooks } from '../api/siyuan';
    import { showMessage } from 'siyuan';

    export let plugin: any;
    export let i18n: any;

    const dispatch = createEventDispatcher();
    let searchQuery = '';
    let openMenuId: string | null = null;

    $: filteredConversations = $conversations.filter(conv => 
        conv.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    function selectConversation(id: string) {
        currentConversationId.set(id);
        dispatch('close'); // Close sidebar on mobile
    }

    function handleDelete(id: string) {
        deleteConversation(id);
        openMenuId = null;
    }

    function toggleMenu(e: MouseEvent, id: string) {
        e.stopPropagation();
        openMenuId = openMenuId === id ? null : id;
    }

    async function handleExportSiYuan(conv: IConversation) {
        openMenuId = null;
        const notebooks = await getNotebooks();
        if (notebooks.length === 0) {
            showMessage("No notebooks found");
            return;
        }

        const notebookId = notebooks[0].id;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const docPath = `/AI Chats/${conv.title.replace(/[\\/:*?"<>|]/g, '_')}-${timestamp}`;
        
        let markdown = `# ${conv.title}\n\n`;
        markdown += `Generated on ${new Date().toLocaleString()}\n\n---\n\n`;
        
        conv.messages.forEach(m => {
            markdown += `### ${m.role === 'user' ? 'You' : 'Assistant'}\n\n${m.content}\n\n`;
            if (m.images && m.images.length > 0) {
                markdown += `*(Attached ${m.images.length} images)*\n\n`;
            }
            if (m.references && m.references.length > 0) {
                markdown += `**References:** ${m.references.map(r => `[[${r.title}]]`).join(', ')}\n\n`;
            }
            markdown += `---\n\n`;
        });

        const result = await createDoc(notebookId, docPath, markdown);
        if (result) {
            showMessage(`Chat exported to SiYuan: ${docPath}`);
        } else {
            showMessage("Failed to export chat to SiYuan");
        }
    }

    function handleExportMarkdown(conv: IConversation) {
        openMenuId = null;
        let markdown = `# ${conv.title}\n\n`;
        conv.messages.forEach(m => {
            markdown += `## ${m.role === 'user' ? 'You' : 'Assistant'}\n\n${m.content}\n\n---\n\n`;
        });

        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${conv.title}.md`;
        a.click();
        URL.revokeObjectURL(url);
    }

    onMount(() => {
        const handleClickOutside = () => openMenuId = null;
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    });
</script>

<div class="w-[280px] h-full flex flex-col glass-effect-strong transition-all duration-500 z-50 border-r border-white/10">
    <div class="px-4 pt-4 pb-2 flex justify-between items-center text-gray-600 dark:text-gray-400">
        <button class="flex items-center gap-2 group cursor-pointer" on:click={() => { createNewConversation(); dispatch('close'); }}>
            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg group-hover:rotate-12 transition-all duration-300">
                 <div class="w-3 h-3 bg-white rounded-full animate-pulse"></div>
            </div>
            <span class="font-bold text-gray-900 dark:text-white tracking-tight">Gemini Chat</span>
        </button>
        <button class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-blue-500/10 dark:hover:bg-blue-400/10 transition-all cursor-pointer hover:scale-110 active:scale-95 border border-transparent hover:border-blue-500/20" on:click={() => { createNewConversation(); dispatch('close'); }}>
            <Plus size={20} class="text-blue-500" />
        </button>
    </div>

    <div class="px-4 py-4">
        <div class="relative flex items-center group">
            <Search size={14} class="absolute left-3 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
            <input 
                type="text" 
                bind:value={searchQuery}
                placeholder="Search conversations..."
                class="w-full pl-10 pr-4 py-2.5 bg-gray-500/5 dark:bg-white/5 border border-transparent focus:border-blue-500/30 rounded-2xl text-sm outline-none transition-all placeholder:text-gray-500"
            />
        </div>
    </div>

    <div class="flex-1 overflow-y-auto px-3 py-2 space-y-1 custom-scrollbar">
        {#each filteredConversations as conv}
            <div class="group relative">
                <button 
                    class="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left transition-all cursor-pointer {conv.id === $currentConversationId ? 'bg-blue-500/10 text-blue-600 dark:text-blue-300 font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50'}"
                    on:click={() => selectConversation(conv.id)}
                >
                    <MessageSquare size={16} class="shrink-0 {conv.id === $currentConversationId ? 'text-blue-500' : 'text-blue-500/70'}" />
                    <div class="flex-1 truncate text-[13px] font-medium">{conv.title}</div>
                    
                    <button 
                        class="p-1.5 rounded-lg text-current opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all cursor-pointer"
                        on:click|stopPropagation={(e) => toggleMenu(e, conv.id)}
                    >
                        <MoreHorizontal size={14} />
                    </button>

                    {#if openMenuId === conv.id}
                        <div class="absolute right-0 top-12 glass-effect-strong rounded-2xl p-1.5 z-50 min-w-[180px] animate-in fade-in zoom-in-95 duration-150">
                            <button 
                                class="w-full px-4 py-2.5 rounded-xl text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors cursor-pointer"
                                on:click|stopPropagation={() => handleExportSiYuan(conv)}
                            >
                                <FileDown size={16} class="text-blue-500" />
                                <span>Save to SiYuan</span>
                            </button>
                            <button 
                                class="w-full px-4 py-2.5 rounded-xl text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors cursor-pointer"
                                on:click|stopPropagation={() => handleExportMarkdown(conv)}
                            >
                                <Download size={16} class="text-green-500" />
                                <span>Export .md</span>
                            </button>
                            <div class="h-px bg-gray-100 dark:bg-gray-800 my-1 mx-2"></div>
                            <button 
                                class="w-full px-4 py-2.5 rounded-xl text-left text-sm hover:bg-red-500/10 flex items-center gap-3 transition-colors cursor-pointer text-red-500"
                                on:click|stopPropagation={() => handleDelete(conv.id)}
                            >
                                <Trash2 size={16} />
                                <span>Delete Chat</span>
                            </button>
                        </div>
                    {/if}
                </button>
            </div>
        {/each}
    </div>

    <div class="p-4 mt-auto border-t border-white/10">
        <button 
            class="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-gray-600 dark:text-gray-400 hover:bg-white/10 dark:hover:bg-gray-800/50 transition-all text-sm font-semibold cursor-pointer group"
            on:click={() => dispatch('openSettings')}
        >
            <Settings size={18} class="group-hover:rotate-90 transition-transform duration-500" />
            <span>{i18n.settings}</span>
        </button>
    </div>
</div>
