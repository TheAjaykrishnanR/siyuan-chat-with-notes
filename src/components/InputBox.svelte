<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';
    import { Send, FileText, X, Search, Plus, Image as ImageIcon } from 'lucide-svelte';
    import { searchBlocks } from '../api/siyuan';

    export let i18n: any;

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
        inputElement.style.height = '60px'; // Base height
        const newHeight = Math.max(60, Math.min(inputElement.scrollHeight, 240));
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
        value += '@';
        inputElement.focus();
        handleInput({ target: inputElement } as unknown as Event);
    }

    onMount(() => {
        autoGrow();
    });
</script>

<div class="px-8 mx-auto inset-x-0 w-full max-w-3xl font-primary mb-2">
    <div class="w-full flex flex-col gap-1.5 relative">
        {#if showSuggestions}
            <div class="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xl z-10 overflow-hidden flex flex-col max-h-[400px]">
                <div class="px-4 py-2 border-b border-gray-50 dark:border-gray-800 flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/50 dark:bg-gray-850/50">
                    <Search size={12} />
                    <span>Quick Reference</span>
                </div>
                <div class="overflow-y-auto flex flex-col py-1">
                    {#if openedNotes.length > 0}
                        <div class="px-4 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50/30 dark:bg-gray-850/30">Opened Notes</div>
                        {#each openedNotes as sug, i}
                            <button class="w-full px-4 py-2 flex flex-col text-left transition-colors {i === selectedIndex ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-850'}" on:click={() => selectSuggestion(sug)}>
                                <div class="flex items-center gap-2">
                                    <FileText size={14} class="text-blue-500 shrink-0" />
                                    <span class="text-sm text-gray-800 dark:text-gray-200 truncate font-medium">{sug.title}</span>
                                </div>
                            </button>
                        {/each}
                    {/if}
                    {#if suggestions.length > 0}
                        <div class="px-4 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50/30 dark:bg-gray-850/30 {openedNotes.length > 0 ? 'mt-2 border-t border-gray-50 dark:border-gray-800' : ''}">Search Results</div>
                        {#each suggestions as sug, i}
                            <button class="w-full px-4 py-2 flex flex-col text-left transition-colors {i + openedNotes.length === selectedIndex ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}" on:click={() => selectSuggestion(sug)}>
                                <div class="flex items-center gap-2">
                                    <FileText size={14} class="text-gray-400 shrink-0" />
                                    <span class="text-sm text-gray-800 dark:text-gray-200 truncate font-medium">{@html sug.content}</span>
                                </div>
                            </button>
                        {/each}
                    {/if}
                </div>
            </div>
        {/if}

        <div id="message-input-container" class="flex flex-col relative w-full shadow-sm rounded-xl border border-gray-200/50 dark:border-gray-800/50 hover:border-gray-300 focus-within:border-gray-300 hover:dark:border-gray-700 focus-within:dark:border-gray-700 transition bg-white dark:bg-gray-850 dark:text-gray-100"
            on:drop={handleDrop}
            on:dragover|preventDefault={() => {}}
        >
            {#if selectedReferences.length > 0 || selectedImages.length > 0}
                <div class="mx-3 mt-3 pb-1.5 flex items-center flex-wrap gap-2">
                    {#each selectedReferences as ref}
                        <div class="relative group">
                            <div class="flex items-center justify-center p-3 bg-gray-100 dark:bg-gray-800 rounded-xl max-w-[200px] border border-gray-200 dark:border-gray-700">
                                <div class="flex items-center gap-2 overflow-hidden">
                                    <FileText size={14} class="text-gray-500 shrink-0" />
                                    <span class="text-xs font-medium truncate text-gray-700 dark:text-gray-300">{ref.title}</span>
                                </div>
                            </div>
                            <div class="absolute -top-2 -right-2">
                                <button class="bg-white text-black border border-white rounded-full transition hover:scale-110 shadow-sm cursor-pointer" on:click={() => removeReference(ref.id)}>
                                    <div class="p-1"><X size={12} strokeWidth={2.5} /></div>
                                </button>
                            </div>
                        </div>
                    {/each}
                    {#each selectedImages as img, i}
                        <div class="relative group">
                            <div class="size-16 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                                <img src={img} alt="Preview" class="w-full h-full object-cover" />
                            </div>
                            <div class="absolute -top-2 -right-2">
                                <button class="bg-white text-black border border-white rounded-full transition hover:scale-110 shadow-sm cursor-pointer" on:click={() => removeImage(i)}>
                                    <div class="p-1"><X size={12} strokeWidth={2.5} /></div>
                                </button>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}

            <div class="relative flex flex-col min-h-[60px]">
                <button 
                    class="absolute top-3 left-3 shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer flex items-center justify-center border border-gray-200/50 dark:border-gray-700/50 z-10" 
                    title="Attach note (Type @)" 
                    on:click={handlePlusClick}
                >
                    <Plus size={14} strokeWidth={3} />
                </button>

                <textarea
                    bind:this={inputElement}
                    bind:value
                    placeholder="@ to reference notes"
                    on:input={handleInput}
                    on:keydown={handleKeydown}
                    on:paste={handlePaste}
                    class="scrollbar-hidden bg-transparent dark:text-gray-100 outline-none w-full resize-none h-[60px] max-h-60 overflow-auto text-[14px] leading-relaxed placeholder-gray-400/80 pl-12 pr-12 py-4"
                ></textarea>

                <button 
                    class="absolute top-3 right-3 shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-black text-white dark:bg-white dark:text-black transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100 disabled:cursor-not-allowed cursor-pointer z-10"
                    on:click={send} 
                    disabled={!value.trim() && selectedReferences.length === 0 && selectedImages.length === 0}
                >
                    <Send size={16} strokeWidth={2.5} />
                </button>
            </div>
        </div>
    </div>
</div>
