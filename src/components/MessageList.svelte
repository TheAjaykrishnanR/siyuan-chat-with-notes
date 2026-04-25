<script lang="ts">
    import { afterUpdate, onMount, createEventDispatcher } from 'svelte';
    import { marked } from 'marked';
    import markedKatex from 'marked-katex-extension';
    import { markedHighlight } from 'marked-highlight';
    import hljs from 'highlight.js';
    import DOMPurify from 'dompurify';
    import type { IMessage } from '../store/chat';
    import { currentConversationId, deleteMessage } from '../store/chat';
    import { FileText, Bot, User, Trash2, RotateCcw } from 'lucide-svelte';

    import 'katex/dist/katex.min.css';
    import 'highlight.js/styles/github-dark.css';

    const dispatch = createEventDispatcher();
    export let messages: IMessage[] = [];
    export let isLoading: boolean = false;

    let scrollContainer: HTMLDivElement;
    let autoScroll = true;

    // Auto-scroll logic
    function scrollToBottom() {
        if (scrollContainer && autoScroll) {
            scrollContainer.scrollTo({
                top: scrollContainer.scrollHeight,
                behavior: 'auto'
            });
        }
    }

    afterUpdate(() => {
        if (isLoading) {
            scrollToBottom();
        }
    });

    // Detect if user manually scrolls up to disable auto-scroll
    function handleScroll() {
        if (!scrollContainer) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
        const atBottom = scrollHeight - scrollTop <= clientHeight + 100;
        autoScroll = atBottom;
    }

    marked.use(markedHighlight({
        langPrefix: 'hljs language-',
        highlight(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        }
    }));

    import katex from 'katex';

    function renderMarkdown(content: string, isLastAssistant: boolean) {
        if (!content) return isLastAssistant ? '...' : '';
        
        try {
            // 1. Process math blocks ($$ ... $$)
            let processed = content.replace(/\$\$([\s\S]+?)\$\$/g, (match, tex) => {
                try {
                    const html = katex.renderToString(tex, { displayMode: true, throwOnError: false });
                    return `<div class="katex-wrapper" data-latex="$$${tex}$$">${html}</div>`;
                } catch (e) { return match; }
            });

            // 2. Process inline math ($ ... $) - being careful not to match $$
            processed = processed.replace(/(?<!\$)\$([^\$\n]+?)\$(?!\$)/g, (match, tex) => {
                try {
                    const html = katex.renderToString(tex, { displayMode: false, throwOnError: false });
                    return `<span class="katex-wrapper" data-latex="$${tex}$">${html}</span>`;
                } catch (e) { return match; }
            });

            // 3. Parse remaining markdown
            const rawHtml = marked.parse(processed, { async: false }) as string;
            
            // 4. Sanitize
            return DOMPurify.sanitize(rawHtml, { 
                USE_PROFILES: { html: true },
                ADD_TAGS: ['math', 'mi', 'mo', 'mn', 'ms', 'mspace', 'mtext', 'merror', 'mfrac', 'mpadded', 'mphantom', 'mroot', 'mrow', 'msqrt', 'mstyle', 'mmultiscripts', 'mover', 'mprescripts', 'msub', 'msubsup', 'msup', 'munder', 'munderover', 'none', 'semantics', 'annotation', 'annotation-xml', 'span', 'svg', 'path', 'div'],
                ADD_ATTR: ['mathvariant', 'mathsize', 'mathcolor', 'display', 'class', 'style', 'aria-hidden', 'viewBox', 'd', 'fill', 'stroke', 'stroke-width', 'width', 'height', 'encoding', 'data-latex'],
                FORBID_ATTR: ['onerror', 'onclick', 'onmouseover'],
                FORBID_TAGS: ['script', 'iframe', 'object']
            });
        } catch (e) {
            console.error("Markdown parsing error:", e);
            return content;
        }
    }

    function handleRegenerate() {
        dispatch('regenerate');
    }
</script>

<div 
    bind:this={scrollContainer}
    on:scroll={handleScroll}
    class="flex-1 overflow-y-auto w-full flex flex-col px-4 py-6 scroll-smooth items-center"
>
    <div class="max-w-3xl w-full flex flex-col gap-6">
        {#each messages as msg, index}
            {@const isLast = index === messages.length - 1}
            {@const isStreaming = isLast && msg.role === 'assistant' && isLoading}
            <div class="group flex w-full message-{msg.role}" dir="auto">
                <div class="shrink-0 mr-3 hidden sm:flex mt-1">
                    <div class="size-8 rounded-full flex items-center justify-center {msg.role === 'user' ? 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100' : 'bg-black dark:bg-white text-white dark:text-black'}">
                        {#if msg.role === 'user'}
                            <User size={16} />
                        {:else}
                            <div class="w-3 h-3 bg-white dark:bg-black rounded-sm {isStreaming ? 'animate-pulse' : ''}"></div>
                        {/if}
                    </div>
                </div>

                <div class="flex-auto w-0 pl-1 relative">
                    <div class="flex items-center justify-between mb-0.5">
                        <div class="font-semibold text-gray-850 dark:text-gray-200">
                            {msg.role === 'user' ? 'You' : 'Assistant'}
                        </div>
                        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {#if msg.role === 'assistant' && isLast && !isLoading}
                                <button class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer" on:click={handleRegenerate} title="Regenerate response">
                                    <RotateCcw size={14} />
                                </button>
                            {/if}
                            <button class="p-1 text-gray-400 hover:text-red-500 transition-colors cursor-pointer" on:click={() => $currentConversationId && deleteMessage($currentConversationId, index)} title="Delete message">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                    
                    <div class="chat-{msg.role} w-full min-w-full markdown-prose prose dark:prose-invert prose-sm max-w-none">
                        {@html renderMarkdown(msg.content, isStreaming)}
                        
                        {#if msg.images && msg.images.length > 0}
                            <div class="mt-3 flex flex-wrap gap-2">
                                {#each msg.images as img}
                                    <div class="relative group max-w-sm">
                                        <img 
                                            src={img} 
                                            alt="Message attachment" 
                                            class="rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm max-h-[300px] object-contain bg-gray-50 dark:bg-gray-900" 
                                        />
                                    </div>
                                {/each}
                            </div>
                        {/if}

                        {#if isStreaming && !msg.content}
                             <div class="mt-1 flex items-center gap-1.5 text-gray-400">
                                <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                                <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
                                <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.4s"></span>
                            </div>
                        {/if}

                        {#if msg.references && msg.references.length > 0}
                            <div class="mb-1 w-full flex flex-col justify-end overflow-x-auto gap-1 flex-wrap mt-3">
                                {#each msg.references as ref}
                                    <div class="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 rounded-xl text-xs font-medium text-gray-700 dark:text-gray-300 w-fit cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                                        <FileText size={14} class="text-gray-500" />
                                        <span class="truncate max-w-[200px]">{ref.title}</span>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        {/each}
    </div>
</div>

<style>
    /* Open-WebUI markdown prose overrides */
    :global(.markdown-prose p) {
        margin-top: 0.5rem;
        margin-bottom: 0.5rem;
        line-height: 1.6;
    }
    :global(.markdown-prose p:first-child) {
        margin-top: 0;
    }
    :global(.markdown-prose p:last-child) {
        margin-bottom: 0;
    }
    :global(.markdown-prose pre) {
        background-color: var(--color-gray-50);
        color: var(--color-gray-800);
        padding: 1rem;
        border-radius: 0.75rem;
        overflow-x: auto;
        margin: 1rem 0;
        border: 1px solid var(--color-gray-200);
        font-size: 0.875rem;
    }
    :global(.dark .markdown-prose pre) {
        background-color: var(--color-gray-850);
        color: var(--color-gray-100);
        border-color: var(--color-gray-800);
    }
    :global(.markdown-prose code) {
        background-color: var(--color-gray-100);
        color: var(--color-gray-800);
        padding: 0.125rem 0.375rem;
        border-radius: 0.375rem;
        font-size: 0.875em;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    :global(.dark .markdown-prose code) {
        background-color: var(--color-gray-800);
        color: var(--color-gray-100);
    }
    :global(.markdown-prose pre code) {
        background-color: transparent;
        padding: 0;
        color: inherit;
        border-radius: 0;
    }
</style>
