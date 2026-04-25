import { fetchSyncPost } from "siyuan";

export async function searchBlocks(query: string) {
    try {
        let stmt = "SELECT * FROM blocks WHERE type='d' ORDER BY updated DESC LIMIT 15";
        
        if (query.trim()) {
            const safeQuery = query.trim().replace(/'/g, "''");
            // Search documents and headings primarily for notes, or any block with content
            stmt = `SELECT * FROM blocks WHERE (content LIKE '%${safeQuery}%' OR name LIKE '%${safeQuery}%') AND (type='d' OR type='h' OR type='p') ORDER BY updated DESC LIMIT 15`;
        }
        
        const response = await fetchSyncPost("/api/query/sql", { stmt });
        const blocks = response.data || [];
        return blocks.map((b: any) => ({
            ...b,
            hPath: b.hpath || "",
            content: b.content || b.name || "Untitled"
        }));
    } catch (e) {
        console.error("Error searching blocks:", e);
        return [];
    }
}

export async function getBlockMarkdown(id: string) {
    try {
        const response = await fetchSyncPost("/api/export/exportMdContent", {
            id
        });
        return response.data?.content || "";
    } catch (e) {
        console.error("Error fetching block markdown:", e);
        return "";
    }
}

export async function getBlockInfo(id: string) {
    try {
        const response = await fetchSyncPost("/api/block/getBlockInfo", {
            id
        });
        return response.data;
    } catch (e) {
        console.error("Error fetching block info:", e);
        return null;
    }
}

export async function createDoc(notebook: string, path: string, markdown: string) {
    try {
        const response = await fetchSyncPost("/api/filetree/createDocWithMd", {
            notebook,
            path,
            markdown
        });
        return response.data; // This is the new Doc ID
    } catch (e) {
        console.error("Error creating doc:", e);
        return null;
    }
}

export async function removeDoc(notebook: string, path: string) {
    try {
        const response = await fetchSyncPost("/api/filetree/removeDoc", {
            notebook,
            path
        });
        return response.data;
    } catch (e) {
        console.error("Error removing doc:", e);
        return null;
    }
}

export async function getNotebooks() {
    try {
        const response = await fetchSyncPost("/api/notebook/lsNotebooks", {});
        return response.data?.notebooks || [];
    } catch (e) {
        console.error("Error listing notebooks:", e);
        return [];
    }
}
