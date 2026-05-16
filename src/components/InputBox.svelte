<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';
    import { Send, Square, FileText, X, Search, Plus, Image as ImageIcon } from 'lucide-svelte';
    import { searchBlocks } from '../api/siyuan';

    export let i18n: any;
    export let isLoading: boolean = false;
    export let onStop: () => void = () => {};

    const dispatch = createEventDispatcher();
    let value = '';
    let showSuggestions = false;
    let suggestions: any[] = [];
    let openedNotes: any[] = [];
    let selectedIndex = 0;
    let selectedReferences: { id: string, title: string }[] = [];
    let selectedImages: string[] = [];
    let inputElement: HTMLTextAreaElement;

    $: allSuggestions = [...openedNotes, ...suggestions];

    function getOpenedNotes() {
        try {
            const siyuanApi = (window as any).siyuan;
            if (!siyuanApi || !siyuanApi.getAllModels) return [];
            
            const allModels = siyuanApi.getAllModels();
            const openedEditors = allModels.editor || [];
            
            const uniqueNotes = new Map();
            openedEditors.forEach((editor: any) => {
                if (editor.protyle && editor.protyle.block.rootID) {
                    const id = editor.protyle.block.rootID;
                    const title = editor.protyle.titleElement?.innerText || "Untitled Note";
                    if (!uniqueNotes.has(id)) {
                        uniqueNotes.set(id, {
                            id: id,
                            content: title,
                            title: title,
                            hPath: "" 
                        });
                    }
                }
            });
            
            return Array.from(uniqueNotes.values());
        } catch (e) {
            console.error("Error in getOpenedNotes:", e);
            return [];
        }
    }

    let searchTimeout: any;
    let currentSearchId = 0;

    async function handleInput(e: Event) {
        try {
            const target = e.target as HTMLTextAreaElement;
            const cursorPosition = target.selectionStart;
            const textBeforeCursor = target.value.slice(0, cursorPosition);
            
            const match = textBeforeCursor.match(/(?:^|\s)@(.*)$/);

            if (match) {
                const query = match[1];
                clearTimeout(searchTimeout);
                const searchId = ++currentSearchId;
                
                searchTimeout = setTimeout(async () => {
                    try {
                        const opened = getOpenedNotes();
                        const searched = await searchBlocks(query);
                        
                        if (searchId !== currentSearchId) return;

                        openedNotes = opened.filter(n => 
                            !query || n.title.toLowerCase().includes(query.toLowerCase())
                        );
                        
                        const openedIds = new Set(openedNotes.map(n => n.id));
                        suggestions = searched.filter(s => !openedIds.has(s.id));
                        
                        showSuggestions = (openedNotes.length + suggestions.length) > 0;
                        selectedIndex = 0;
                    } catch (error) {
                        console.error("Error fetching suggestions:", error);
                        if (searchId === currentSearchId) showSuggestions = false;
                    }
                }, 150);
            } else {
                clearTimeout(searchTimeout);
                showSuggestions = false;
            }
        } catch (error) {
            console.error("Error in handleInput:", error);
            showSuggestions = false;
        }
        
        autoGrow();
    }

    function handlePaste(e: ClipboardEvent) {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                if (file) uploadImage(file);
            }
        }
    }

    function handleDrop(e: DragEvent) {
        e.preventDefault();
        const files = e.dataTransfer?.files;
        if (!files) return;
        for (const file of files) {
            if (file.type.indexOf('image') !== -1) uploadImage(file);
        }
    }

    function uploadImage(file: File) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target?.result as string;
            if (!selectedImages.includes(base64)) {
                selectedImages = [...selectedImages, base64];
            }
        };
        reader.readAsDataURL(file);
    }

    function removeImage(index: number) {
        selectedImages = selectedImages.filter((_, i) => i !== index);
    }

    function autoGrow() {
        if (!inputElement) return;
        inputElement.style.height = '72px'; // Base height
        const newHeight = Math.max(72, Math.min(inputElement.scrollHeight, 320));
        inputElement.style.height = newHeight + 'px';
    }

    function selectSuggestion(suggestion: any) {
        const cursorPosition = inputElement.selectionStart;
        const textBeforeCursor = value.slice(0, cursorPosition);
        const textAfterCursor = value.slice(cursorPosition);
        const lastAt = textBeforeCursor.lastIndexOf('@');
        
        value = textBeforeCursor.slice(0, lastAt) + textAfterCursor;
        showSuggestions = false;
        
        if (!selectedReferences.find(r => r.id === suggestion.id)) {
            selectedReferences = [...selectedReferences, { 
                id: suggestion.id, 
                title: (suggestion.content || suggestion.title || suggestion.blockID).replace(/<mark>/g, '').replace(/<\/mark>/g, '')
            }];
        }
        
        inputElement.focus();
        setTimeout(autoGrow, 0);
    }

    function removeReference(id: string) {
        selectedReferences = selectedReferences.filter(r => r.id !== id);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (showSuggestions) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % allSuggestions.length;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = (selectedIndex - 1 + allSuggestions.length) % allSuggestions.length;
            } else if (e.key === 'Enter') {
                e.preventDefault();
                selectSuggestion(allSuggestions[selectedIndex]);
            } else if (e.key === 'Escape') {
                showSuggestions = false;
            }
        } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    }

    function send() {
        if (!value.trim() && selectedReferences.length === 0 && selectedImages.length === 0) return;
        dispatch('send', {
            content: value,
            references: selectedReferences,
            images: selectedImages
        });
        value = '';
        selectedReferences = [];
        selectedImages = [];
        setTimeout(autoGrow, 0);
    }

    function handlePlusClick() {
        const opened = getOpenedNotes();
        openedNotes = opened;
        currentSearchId++;
        const searchId = currentSearchId;
        searchBlocks("").then(searched => {
            if (searchId !== currentSearchId) return;
            const openedIds = new Set(openedNotes.map(n => n.id));
            suggestions = searched.filter(s => !openedIds.has(s.id));
            showSuggestions = (openedNotes.length + suggestions.length) > 0;
            selectedIndex = 0;
        });
    }

    onMount(() => {
        autoGrow();
    });
</script>

<div class="px-2 mx-auto inset-x-0 w-full max-w-4xl font-primary mb-2">
    <div class="w-full flex flex-col gap-2 relative">
        {#if showSuggestions}
            <div class="absolute bottom-full left-0 right-0 mb-4 glass-effect-strong rounded-2xl z-50 overflow-hidden flex flex-col max-h-[400px] animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div class="px-6 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                    <Search size={12} class="text-blue-500" />
                    <span>Quick Reference</span>
                </div>
                <div class="overflow-y-auto flex flex-col py-2 custom-scrollbar">
                    {#if openedNotes.length > 0}
                        <div class="px-6 py-2 text-[10px] font-bold text-blue-500/70 uppercase tracking-widest">Opened Notes</div>
                        {#each openedNotes as sug, i}
                            <button class="w-full px-6 py-3 flex flex-col text-left transition-all {i === selectedIndex ? 'bg-blue-500/10 rounded-xl' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}" on:click={() => selectSuggestion(sug)}>
                                <div class="flex items-center gap-3">
                                    <FileText size={16} class="{i === selectedIndex ? 'text-blue-500' : 'text-blue-500/70'} shrink-0" />
                                    <span class="text-sm truncate {i === selectedIndex ? 'text-blue-600 font-medium' : ''}">{sug.title}</span>
                                </div>
                            </button>
                        {/each}
                    {/if}
                    {#if suggestions.length > 0}
                        <div class="px-6 py-2 text-[10px] font-bold text-purple-500/70 uppercase tracking-widest {openedNotes.length > 0 ? 'mt-4 border-t border-gray-100 dark:border-gray-800 pt-4' : ''}">Search Results</div>
                        {#each suggestions as sug, i}
                            <button class="w-full px-6 py-3 flex flex-col text-left transition-all {i + openedNotes.length === selectedIndex ? 'bg-purple-500/10 rounded-xl' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}" on:click={() => selectSuggestion(sug)}>
                                <div class="flex items-center gap-3">
                                    <FileText size={16} class="{i + openedNotes.length === selectedIndex ? 'text-purple-500' : 'text-purple-500/70'} shrink-0" />
                                    <span class="text-sm truncate {i + openedNotes.length === selectedIndex ? 'text-purple-600 font-medium' : ''}">{@html sug.content}</span>
                                </div>
                            </button>
                        {/each}
                    {/if}
                </div>
            </div>
        {/if}

        <div id="message-input-container" class="overflow-hidden flex flex-col transition-all duration-500 group rounded-3xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl shadow-gray-300/50 dark:shadow-black/30"
            on:drop={handleDrop}
            on:dragover|preventDefault={() => {}}
        >
            {#if selectedReferences.length > 0 || selectedImages.length > 0}
                <div class="mx-4 mt-4 pb-2 flex items-center flex-wrap gap-3">
                    {#each selectedReferences as ref}
                        <div class="relative group animate-in zoom-in duration-300">
                            <div class="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl max-w-[220px]">
                                <FileText size={14} class="text-blue-500 shrink-0" />
                                <span class="text-xs font-bold truncate text-blue-700 dark:text-blue-300">{ref.title}</span>
                            </div>
                            <button class="absolute -top-2 -right-2 bg-white dark:bg-gray-800 text-red-500 border border-red-500/20 rounded-full p-1 shadow-lg hover:scale-125 transition-all cursor-pointer" on:click={() => removeReference(ref.id)}>
                                <X size={10} strokeWidth={4} />
                            </button>
                        </div>
                    {/each}
                    {#each selectedImages as img, i}
                        <div class="relative group animate-in zoom-in duration-300">
                            <div class="size-20 rounded-xl overflow-hidden border-2 border-purple-500/20 shadow-lg">
                                <img src={img} alt="Preview" class="w-full h-full object-cover" />
                            </div>
                            <button class="absolute -top-2 -right-2 bg-white dark:bg-gray-800 text-red-500 border border-red-500/20 rounded-full p-1 shadow-lg hover:scale-125 transition-all cursor-pointer" on:click={() => removeImage(i)}>
                                <X size={10} strokeWidth={4} />
                            </button>
                        </div>
                    {/each}
                </div>
            {:else}
            {/if}

            <div class="relative flex flex-col min-h-[72px]">
                <button 
                    class="absolute left-4 shrink-0 w-10 h-10 rounded-full text-blue-500 hover:bg-blue-500/10 transition-all cursor-pointer flex items-center justify-center border border-blue-500/10 z-10 hover:scale-110 active:scale-90" 
                    style="top: 50%; margin-top: -20px;"
                    title="Attach note (Type @)" 
                    on:click={handlePlusClick}
                >
                    <Plus size={18} strokeWidth={3} />
                </button>

                <textarea
                    bind:this={inputElement}
                    bind:value
                    placeholder="Type @ to reference your notes..."
                    on:input={handleInput}
                    on:keydown={handleKeydown}
                    on:paste={handlePaste}
                    class="scrollbar-hidden bg-transparent text-gray-950 dark:text-gray-50 outline-none w-full resize-none h-[72px] max-h-80 overflow-auto text-base leading-relaxed placeholder-gray-400 dark:placeholder-gray-500 pl-16 pr-16 py-6 font-normal"
                ></textarea>

                {#if isLoading}
                    <button 
                        class="absolute right-4 shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-red-500 text-white transition-all hover:scale-110 active:scale-90 shadow-lg cursor-pointer z-10 animate-in fade-in zoom-in duration-200"
                        style="top: 50%; margin-top: -20px;"
                        on:click={onStop}
                    >
                        <Square size={16} fill="currentColor" />
                    </button>
                {:else}
                    <button 
                        class="absolute right-4 shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-white transition-all hover:scale-110 active:scale-90 shadow-lg disabled:opacity-20 disabled:grayscale disabled:hover:scale-100 disabled:cursor-not-allowed cursor-pointer z-10"
                        style="top: 50%; margin-top: -20px;"
                        on:click={send} 
                        disabled={!value.trim() && selectedReferences.length === 0 && selectedImages.length === 0}
                    >
                        <Send size={18} strokeWidth={2.5} class={value.trim() ? 'animate-pulse' : ''} />
                    </button>
                {/if}
            </div>
        </div>
    </div>
</div>
