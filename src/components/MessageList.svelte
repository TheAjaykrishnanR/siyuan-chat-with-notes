<script lang="ts">
    import { createEventDispatcher, afterUpdate, onMount } from 'svelte';
    import { marked } from 'marked';
    import markedKatex from 'marked-katex-extension';
    import { markedHighlight } from 'marked-highlight';
    import hljs from 'highlight.js';
    import katex from 'katex';
    import DOMPurify from 'dompurify';
    import type { IMessage } from '../store/chat';
    import { currentConversationId, deleteMessage } from '../store/chat';
    import { FileText, Bot, User, Trash2, RotateCcw } from 'lucide-svelte';

    import 'katex/dist/katex.min.css';
    import 'highlight.js/styles/github.css';

    const dispatch = createEventDispatcher();
    export let messages: IMessage[] = [];
    export let isLoading: boolean = false;
    export let debugMode: boolean = false;

    let scrollContainer: HTMLDivElement;
    let autoScroll = true;

    function handleScroll() {
        if (!scrollContainer) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
        autoScroll = scrollHeight - scrollTop - clientHeight < 50;
    }

    afterUpdate(() => {
        if (autoScroll && scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
    });

    onMount(() => {
        if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
    });

    marked.use(markedKatex({
        throwOnError: false
    }));

    // Properly override the extension's rendering to add the copy-latex wrapper
    marked.use({
        extensions: [
            {
                name: 'inlineKatex',
                renderer(token) {
                    const html = katex.renderToString(token.text, { displayMode: false });
                    return `<span class="katex-wrapper" data-latex="$${token.text}$">${html}</span>`;
                }
            },
            {
                name: 'blockKatex',
                renderer(token) {
                    const html = katex.renderToString(token.text, { displayMode: true });
                    return `<div class="katex-wrapper" data-latex="$$${token.text}$$">${html}</div>`;
                }
            }
        ]
    });

    marked.use(markedHighlight({
        langPrefix: 'hljs language-',
        highlight(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        }
    }));

    function normalizeLatexDelimiters(text: string): string {
        if (!text) return '';
        return text
            // Handle block delimiters \[ ... \]
            .replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n$$\n${math.trim()}\n$$\n`)
            // Handle inline delimiters \( ... \)
            .replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math.trim()}$`);
    }

    function renderMarkdown(content: string) {
        if (!content) return '';
        
        try {
            if (debugMode) {
                console.log('[RAW LLM OUTPUT]', content);
            }
            const normalized = normalizeLatexDelimiters(content);
            const rawHtml = marked.parse(normalized, { async: false }) as string;
            
            return DOMPurify.sanitize(rawHtml, { 
                USE_PROFILES: { html: true },
                ADD_TAGS: ['math', 'mi', 'mo', 'mn', 'ms', 'mspace', 'mtext', 'merror', 'mfrac', 'mpadded', 'mphantom', 'mroot', 'mrow', 'msqrt', 'mstyle', 'mmultiscripts', 'mover', 'mprescripts', 'msub', 'msubsup', 'msup', 'munder', 'munderover', 'none', 'semantics', 'annotation', 'annotation-xml', 'span', 'svg', 'path', 'div'],
                ADD_ATTR: ['mathvariant', 'mathsize', 'mathcolor', 'display', 'class', 'style', 'aria-hidden', 'viewBox', 'd', 'fill', 'stroke', 'stroke-width', 'width', 'height', 'encoding', 'data-latex'],
                FORBID_ATTR: ['onerror', 'onclick', 'onmouseover'],
                FORBID_TAGS: ['script', 'iframe', 'object']
            });
        } catch (e) {
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
    class="flex-1 overflow-y-auto w-full flex flex-col px-4 py-8 scroll-smooth items-center custom-scrollbar"
>
    <div class="max-w-4xl w-full flex flex-col gap-8">
        {#each messages as msg, index}
            {@const isLast = index === messages.length - 1}
            {@const isStreaming = isLast && msg.role === 'assistant' && isLoading}
            {@const isUser = msg.role === 'user'}
            
            <div class="group flex w-full {isUser ? 'justify-end' : ''} {!isStreaming ? 'animate-in fade-in slide-in-from-bottom-8 duration-500' : ''}" dir="auto">
                {#if !isUser}
                    <div class="shrink-0 mr-3 mt-0.5">
                        <div class="size-8 rounded-xl flex items-center justify-center shadow-md transition-transform group-hover:scale-110 bg-gradient-to-br from-purple-500 to-purple-600 text-white relative">
                             <div class="size-3 bg-white rounded-sm rotate-45 {isStreaming ? 'animate-spin' : ''}"></div>
                            {#if isStreaming}
                                <div class="absolute inset-0 bg-purple-200/30 rounded-xl animate-ping"></div>
                            {/if}
                        </div>
                    </div>
                {/if}

                <div class="{isUser ? 'max-w-[75%]' : 'flex-auto min-w-0'} relative">
                    {#if isUser}
                        <div class="px-3.5 py-2.5 rounded-2xl bg-blue-500/10 dark:bg-blue-400/10 border border-blue-500/20 dark:border-blue-400/20 shadow-md shadow-blue-500/5 dark:shadow-blue-400/5">
                            <div class="leading-relaxed">{msg.content}</div>
                            {#if msg.images && msg.images.length > 0}
                                <div class="mt-3 flex flex-wrap gap-2">
                                    {#each msg.images as img}
                                        <img src={img} alt="Attachment" class="rounded-xl max-h-[200px] object-contain" />
                                    {/each}
                                </div>
                            {/if}
                            {#if msg.references && msg.references.length > 0}
                                <div class="mt-3 flex flex-wrap gap-2">
                                    {#each msg.references as ref}
                                        <div class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400">
                                            <FileText size={12} class="shrink-0" />
                                            <span class="truncate max-w-[200px]">{ref.title}</span>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {:else}
                        <div class="w-full min-w-full markdown-prose prose dark:prose-invert prose-base max-w-none leading-relaxed">
                            {@html renderMarkdown(msg.content)}
                            
                            {#if msg.images && msg.images.length > 0}
                                <div class="mt-4 flex flex-wrap gap-3">
                                    {#each msg.images as img}
                                        <img src={img} alt="Attachment" class="rounded-3xl border border-white/10 shadow-2xl max-h-[400px] object-contain bg-white/5 backdrop-blur-sm" />
                                    {/each}
                                </div>
                            {/if}

                            {#if isStreaming && !msg.content}
                                <div class="mt-4 flex items-center gap-2 text-blue-500">
                                    <span class="w-2 h-2 bg-current rounded-full animate-bounce"></span>
                                    <span class="w-2 h-2 bg-current rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
                                    <span class="w-2 h-2 bg-current rounded-full animate-bounce" style="animation-delay: 0.4s"></span>
                                </div>
                            {/if}

                            {#if msg.references && msg.references.length > 0}
                                <div class="mt-6 flex flex-wrap gap-3 animate-in fade-in duration-700">
                                    {#each msg.references as ref}
                                        <div class="flex items-center gap-2 px-4 py-2 bg-blue-500/5 border border-blue-500/10 rounded-2xl text-xs font-bold text-blue-600 dark:text-blue-400 w-fit cursor-pointer hover:bg-blue-500/10 hover:border-blue-500/30 transition-all hover:scale-105 active:scale-95 shadow-sm">
                                            <FileText size={16} class="shrink-0" />
                                            <span class="truncate max-w-[240px]">{ref.title}</span>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/if}

                    <div class="flex items-center justify-end gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-all">
                        {#if msg.role === 'assistant' && isLast && !isLoading}
                            <button class="p-1 rounded-md text-gray-400 hover:text-blue-500 transition-all cursor-pointer" on:click={handleRegenerate} title="Regenerate">
                                <RotateCcw size={12} />
                            </button>
                        {/if}
                        <button class="p-1 rounded-md text-gray-400 hover:text-red-500 transition-all cursor-pointer" on:click={() => $currentConversationId && deleteMessage($currentConversationId, index)} title="Delete">
                            <Trash2 size={12} />
                        </button>
                    </div>
                </div>

                {#if isUser}
                    <div class="shrink-0 ml-3 mt-0.5">
                        <div class="size-8 rounded-xl flex items-center justify-center shadow-md transition-transform group-hover:scale-110 bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                            <User size={16} strokeWidth={2.5} />
                        </div>
                    </div>
                {/if}
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
        background-color: var(--color-gray-100) !important;
        color: var(--color-gray-900) !important;
        padding: 1rem;
        border-radius: 0.75rem;
        overflow-x: auto;
        margin: 1rem 0;
        border: 1px solid var(--color-gray-200) !important;
        font-size: 0.875rem;
    }
    :global(.markdown-prose pre code) {
        background-color: transparent !important;
        padding: 0;
        color: var(--color-gray-900) !important;
        border-radius: 0;
    }
    :global(.markdown-prose code:not(pre code)) {
        background-color: var(--color-gray-100) !important;
        color: var(--color-gray-900) !important;
        padding: 0.125rem 0.375rem;
        border-radius: 0.375rem;
        font-size: 0.875em;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-weight: 500;
    }

    /* KaTeX specific styling for better alignment */
    :global(.katex-display) {
        margin: 1em 0 !important;
        overflow-x: auto;
        overflow-y: hidden;
        padding: 0.5em 0;
    }
    :global(.katex) {
        font-size: 1.05em !important;
        text-rendering: auto;
    }

    @media (prefers-color-scheme: dark) {
        :global(.markdown-prose pre) {
            background-color: var(--color-gray-900) !important;
            color: var(--color-gray-100) !important;
            border-color: var(--color-gray-800) !important;
        }
        :global(.markdown-prose pre code) {
            color: var(--color-gray-100) !important;
        }
        :global(.markdown-prose code:not(pre code)) {
            background-color: var(--color-gray-800) !important;
            color: var(--color-gray-100) !important;
        }
        :global(.markdown-prose pre .hljs) {
            background: transparent !important;
            color: var(--color-gray-100) !important;
        }
    }
</style>
