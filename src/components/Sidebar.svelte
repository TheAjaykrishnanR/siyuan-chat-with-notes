<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';
    import { conversations, currentConversationId, createNewConversation, deleteConversation } from '../store/chat';
    import type { IConversation } from '../store/chat';
    import { Plus, Search, MessageSquare, MoreHorizontal, Trash2, Settings, FileDown, Download } from 'lucide-svelte';
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

<div class="w-[260px] h-full flex flex-col bg-gray-50 dark:bg-gray-950 transition-all duration-300 z-10 border-r border-gray-200 dark:border-gray-800">
    <div class="px-[9px] pt-2 pb-1.5 flex justify-between space-x-1 text-gray-600 dark:text-gray-400 sticky top-0 z-1 -mb-3">
        <a class="flex items-center rounded-xl w-[34px] h-[34px] justify-center hover:bg-gray-100/50 dark:hover:bg-gray-850/50 transition cursor-pointer" on:click={() => { createNewConversation(); dispatch('close'); }}>
            <div class="w-6 h-6 rounded-full bg-black dark:bg-white flex items-center justify-center">
                 <div class="w-3 h-3 bg-white dark:bg-black rounded-sm"></div>
            </div>
        </a>
        <a class="flex flex-1 px-0.5 cursor-pointer" on:click={() => { createNewConversation(); dispatch('close'); }}>      
            <div class="self-center font-medium text-gray-850 dark:text-white font-primary">
                Chat
            </div>
        </a>
        <div class="flex items-center space-x-1">
             <button class="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-850 transition cursor-pointer" on:click={() => { createNewConversation(); dispatch('close'); }}>
                <Plus size={18} />
            </button>
        </div>
    </div>

    <div class="px-3 pt-6 pb-2">
        <div class="relative flex items-center">
            <Search size={14} class="absolute left-3 text-gray-400" />
            <input 
                type="text" 
                bind:value={searchQuery}
                placeholder="Search chats..."
                class="w-full pl-9 pr-3 py-2 bg-gray-100 dark:bg-gray-900 border-none rounded-xl text-sm outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-gray-700 transition-all"
            />
        </div>
    </div>

    <div class="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {#each filteredConversations as conv}
            <div class="group relative">
                <button 
                    class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer {conv.id === $currentConversationId ? 'bg-white dark:bg-gray-850 shadow-sm text-black dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900'}"
                    on:click={() => selectConversation(conv.id)}
                >
                    <MessageSquare size={16} class="shrink-0" />
                    <div class="flex-1 truncate text-[13px] font-medium">{conv.title}</div>
                    
                    <button 
                        class="absolute right-2 top-1.5 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800 opacity-0 group-hover:opacity-100 transition-all cursor-pointer z-1"
                        on:click|stopPropagation={(e) => toggleMenu(e, conv.id)}
                    >
                        <MoreHorizontal size={14} />
                    </button>

                    {#if openMenuId === conv.id}
                        <div class="absolute right-2 top-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1.5 z-10 min-w-[160px] overflow-hidden animate-in fade-in zoom-in duration-100">
                            <button 
                                class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                                on:click|stopPropagation={() => handleExportSiYuan(conv)}
                            >
                                <FileDown size={14} />
                                <span>Save to SiYuan</span>
                            </button>
                            <button 
                                class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                                on:click|stopPropagation={() => handleExportMarkdown(conv)}
                            >
                                <Download size={14} />
                                <span>Export .md</span>
                            </button>
                            <div class="h-px bg-gray-100 dark:bg-gray-700 my-1"></div>
                            <button 
                                class="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2.5 transition-colors cursor-pointer"
                                on:click|stopPropagation={() => handleDelete(conv.id)}
                            >
                                <Trash2 size={14} />
                                <span>Delete Chat</span>
                            </button>
                        </div>
                    {/if}
                </button>
            </div>
        {/each}
    </div>

    <div class="p-2 mt-auto border-t border-gray-200 dark:border-gray-800">
        <button 
            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900 transition-all text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
            on:click={() => dispatch('openSettings')}
        >
            <Settings size={16} />
            <span>{i18n.settings}</span>
        </button>
    </div>
</div>
