/**
 * 按换行把一条回复拆成多条 QQ 消息（气泡）。
 *
 * 规则：
 * - 每个非空行算一条；
 * - 空行只作分隔，不单独成条；
 * - ``` 围起来的代码块整块算一条（块内的换行不拆）；
 * - 超过 max 条时，多出来的合并到最后一条。
 */
export const MAX_BUBBLES = 4;

export function splitBubbles(text, max = MAX_BUBBLES) {
    if (typeof text !== 'string' || text.trim() === '')
        return [];
    const parts = [];
    let cur = [];
    let inFence = false;
    const flush = () => {
        if (cur.length === 0)
            return;
        const s = cur.join('\n').trim();
        if (s)
            parts.push(s);
        cur = [];
    };
    for (const raw of text.split('\n')) {
        const line = raw.replace(/\s+$/, '');
        const isFence = line.trimStart().startsWith('```');
        if (isFence) {
            if (inFence) {
                cur.push(line);
                inFence = false;
                flush();
            }
            else {
                flush();
                inFence = true;
                cur.push(line);
            }
            continue;
        }
        if (inFence) {
            cur.push(line);
            continue;
        }
        if (line.trim() === '') {
            flush();
            continue;
        }
        flush();
        cur.push(line);
    }
    flush();
    if (parts.length > max) {
        const head = parts.slice(0, max - 1);
        const tail = parts.slice(max - 1).join('\n');
        return [...head, tail];
    }
    return parts;
}
