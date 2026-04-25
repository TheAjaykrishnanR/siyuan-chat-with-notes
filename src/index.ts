import { Plugin, Setting } from "siyuan";
import App from "./App.svelte";
import "./app.css";
import { fetchModels } from "./api/ai";
import { conversations, currentConversationId } from "./store/chat";

const STORAGE_NAME = "chat-settings";
const CONV_STORAGE = "chat-conversations";
const DOCK_TYPE = "siyuan-chat-with-notes-dock";

export default class ChatPlugin extends Plugin {
    private appInstance: App;
    private modelSelectElement: HTMLSelectElement;

    async onload() {
        this.addIcons(`<symbol id="iconChat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></symbol>`);

        // Load settings
        const loadedData = await this.loadData(STORAGE_NAME);
        this.data[STORAGE_NAME] = loadedData || {
            provider: "openai",
            model: "",
            keys: {
                openai: "",
                anthropic: "",
                gemini: "",
                deepseek: ""
            }
        };

        // Migration for single apiKey to multiple keys
        if (loadedData && loadedData.apiKey && !loadedData.keys) {
            this.data[STORAGE_NAME].keys = {
                openai: loadedData.provider === 'openai' ? loadedData.apiKey : "",
                anthropic: loadedData.provider === 'anthropic' ? loadedData.apiKey : "",
                gemini: loadedData.provider === 'gemini' ? loadedData.apiKey : "",
                deepseek: loadedData.provider === 'deepseek' ? loadedData.apiKey : ""
            };
        }

        // Load conversations
        const loadedConvs = await this.loadData(CONV_STORAGE);
        if (loadedConvs && Array.isArray(loadedConvs)) {
            conversations.set(loadedConvs);
            if (loadedConvs.length > 0) {
                currentConversationId.set(loadedConvs[0].id);
            }
        }

        // Persist conversations on every change
        conversations.subscribe(val => {
            if (val) {
                this.saveData(CONV_STORAGE, val);
            }
        });

        this.addDock({
            config: {
                position: "RightTop",
                size: { width: 300, height: 0 },
                icon: "iconChat",
                title: this.i18n.chatWithNotes,
            },
            type: DOCK_TYPE,
            data: {},
            init: (dock) => {
                dock.element.classList.add("fn__flex-1", "fn__flex", "fn__flex-column");
                this.appInstance = new App({
                    target: dock.element,
                    props: {
                        app: this.app,
                        plugin: this
                    }
                });
            },
            destroy: () => {
                if (this.appInstance) {
                    this.appInstance.$destroy();
                }
            }
        });

        this.setting = new Setting({
            confirmCallback: () => {
                this.saveData(STORAGE_NAME, this.data[STORAGE_NAME]);
            }
        });

        this.setting.addItem({
            title: this.i18n.apiProvider,
            createActionElement: () => {
                const selectElement = document.createElement("select");
                selectElement.className = "b3-select fn__flex-center fn__size200";
                ["openai", "anthropic", "gemini", "deepseek"].forEach(provider => {
                    const option = document.createElement("option");
                    option.value = provider;
                    option.text = provider.charAt(0).toUpperCase() + provider.slice(1);
                    if (provider === this.data[STORAGE_NAME].provider) {
                        option.selected = true;
                    }
                    selectElement.appendChild(option);
                });
                selectElement.onchange = () => {
                    this.data[STORAGE_NAME].provider = selectElement.value;
                    this.updateModelOptions();
                };
                return selectElement;
            }
        });

        this.setting.addItem({
            title: this.i18n.apiKey,
            createActionElement: () => {
                const inputElement = document.createElement("input");
                inputElement.className = "b3-text-field fn__flex-center fn__size200";
                inputElement.type = "password";
                inputElement.value = this.data[STORAGE_NAME].apiKey;
                
                let timer: any;
                inputElement.oninput = () => {
                    this.data[STORAGE_NAME].apiKey = inputElement.value;
                    clearTimeout(timer);
                    timer = setTimeout(() => {
                        this.updateModelOptions();
                    }, 500);
                };
                return inputElement;
            }
        });

        this.setting.addItem({
            title: this.i18n.apiModel,
            createActionElement: () => {
                const container = document.createElement("div");
                container.className = "fn__flex items-center gap-2";

                this.modelSelectElement = document.createElement("select");
                this.modelSelectElement.className = "b3-select fn__flex-center fn__size200";
                
                const refreshBtn = document.createElement("button");
                refreshBtn.className = "b3-button b3-button--outline fn__flex-center p-1.5 flex items-center justify-center transition-all hover:bg-gray-100 dark:hover:bg-gray-800";
                refreshBtn.style.minWidth = "32px";
                refreshBtn.style.height = "28px";
                refreshBtn.innerHTML = `<svg class="svg size-4" style="margin-right: 0;"><use xlink:href="#iconRefresh"></use></svg>`;
                refreshBtn.onclick = () => {
                    this.updateModelOptions();
                };

                container.appendChild(this.modelSelectElement);
                container.appendChild(refreshBtn);

                this.updateModelOptions();
                this.modelSelectElement.onchange = () => {
                    this.data[STORAGE_NAME].model = this.modelSelectElement.value;
                };
                return container;
            }
        });
    }

    private async updateModelOptions() {
        if (!this.modelSelectElement) return;

        const provider = this.data[STORAGE_NAME].provider;
        const apiKey = this.data[STORAGE_NAME].apiKey;

        const models = await fetchModels(provider, apiKey);
        
        this.modelSelectElement.innerHTML = "";
        
        if (models.length === 0) {
            const option = document.createElement("option");
            option.value = "";
            option.text = apiKey ? "No models found" : "Enter API Key first";
            this.modelSelectElement.appendChild(option);
            return;
        }

        models.forEach(model => {
            const option = document.createElement("option");
            option.value = model;
            option.text = model;
            if (model === this.data[STORAGE_NAME].model) {
                option.selected = true;
            }
            this.modelSelectElement.appendChild(option);
        });

        if (!this.data[STORAGE_NAME].model || !models.includes(this.data[STORAGE_NAME].model)) {
            this.data[STORAGE_NAME].model = models[0];
        }
    }

    onunload() {
        if (this.appInstance) {
            this.appInstance.$destroy();
        }
    }
}
