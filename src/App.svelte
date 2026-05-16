<script lang="ts">
    import { onMount } from 'svelte';
    import ChatLayout from './components/ChatLayout.svelte';
    import { Copy } from 'lucide-svelte';

    export let app: any;
    export let plugin: any;

    let showContextMenu = false;
    let contextMenuPos = { x: 0, y: 0 };
    let selectedText = '';

    function handleContextMenu(e: MouseEvent) {
        const selection = window.getSelection();
        const text = selection?.toString().trim();
        
        if (text) {
            e.preventDefault();
            
            // Extract text with LaTeX preserved
            selectedText = getSelectionTextWithLatex(selection);
            
            contextMenuPos = { x: e.clientX, y: e.clientY };
            showContextMenu = true;
        } else {
            showContextMenu = false;
        }
    }

    function getSelectionTextWithLatex(selection: Selection | null): string {
        if (!selection || selection.rangeCount === 0) return '';
        
        const range = selection.getRangeAt(0);
        const fragment = range.cloneContents();
        const container = document.createElement('div');
        container.appendChild(fragment);
        
        // Find all katex wrappers and replace them with their raw LaTeX source
        const katexWrappers = container.querySelectorAll('.katex-wrapper');
        katexWrappers.forEach(el => {
            const latex = el.getAttribute('data-latex');
            if (latex) {
                el.replaceWith(document.createTextNode(latex));
            }
        });
        
        // Handle case where selection is INSIDE a katex element
        let current: Node | null = range.commonAncestorContainer;
        while (current && current !== document.body) {
            if (current instanceof HTMLElement && current.classList.contains('katex-wrapper')) {
                const latex = current.getAttribute('data-latex');
                if (latex) return latex;
            }
            current = current.parentNode;
        }
        
        return container.innerText.trim();
    }

    async function copyText() {
        if (selectedText) {
            try {
                await navigator.clipboard.writeText(selectedText);
            } catch (err) {
                console.error('Failed to copy text: ', err);
            }
            showContextMenu = false;
        }
    }

    onMount(() => {
        const handleClick = () => {
            if (showContextMenu) showContextMenu = false;
        };
        
        // Also handle global copy event to provide same behavior for Ctrl+C
        const handleGlobalCopy = (e: ClipboardEvent) => {
            const selection = window.getSelection();
            if (selection && selection.toString().trim()) {
                const tex = getSelectionTextWithLatex(selection);
                if (tex) {
                    e.clipboardData?.setData('text/plain', tex);
                    e.preventDefault();
                }
            }
        };

        window.addEventListener('click', handleClick);
        window.addEventListener('copy', handleGlobalCopy);
        return () => {
            window.removeEventListener('click', handleClick);
            window.removeEventListener('copy', handleGlobalCopy);
        };
    });
</script>

<div class="chat-app" on:contextmenu={handleContextMenu}>
    <ChatLayout {plugin} />

    {#if showContextMenu}
        <div 
            class="fixed z-[999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl p-1.5 min-w-[140px] animate-in fade-in zoom-in duration-100"
            style="left: {contextMenuPos.x}px; top: {contextMenuPos.y}px;"
            on:click|stopPropagation
        >
            <button 
                class="w-full px-4 py-2 rounded-xl text-left text-sm flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer text-gray-700 dark:text-gray-200"
                on:click={copyText}
            >
                <Copy size={15} />
                <span class="font-medium">Copy</span>
            </button>
        </div>
    {/if}
</div>

<style>
    :global(.chat-app) {
        height: 100%;
        width: 100%;
        overflow: hidden;
        font-family: var(--b3-font-family);
        display: flex;
        flex-direction: column;
        position: relative;
        z-index: 1;
        user-select: text;
        -webkit-user-select: text;
    }
</style>
