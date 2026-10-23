/**
 * 内置 qqbot_send_text 工具 — 把一段文本作为一条独立的 QQ 消息发出去。
 *
 * 用途：让模型把一条回复拆成 2～3 条短消息（QQ 一轮最多 5 个气泡）。
 * 与正文的区别：正文在回合结束时由 outbound 统一发送，只会成为一条消息；
 * 调用本工具则在调用当下立即发出一条。
 *
 * 限制：每次收信（同一 msgId）最多调用 3 次，避免刷屏；
 * 与 outbound 的被动回复限额（ReplyLimiter limit=4）相加正好不超过 4 条。
 */
export const SEND_TEXT_TOOL_NAME = 'qqbot_send_text';

const MAX_PER_INBOUND = 3;
const MAX_TRACKED = 200;

/** 每条入站消息的发送计数：msgId（没有时退回 agent）→ 次数 */
const counters = new Map();

function targetKey(target, agent) {
    return target?.msgId !== undefined && target?.msgId !== ''
        ? `msg:${target.msgId}`
        : `agent:${String(agent)}`;
}

function takeSlot(key) {
    const used = counters.get(key) ?? 0;
    if (used >= MAX_PER_INBOUND)
        return false;
    counters.set(key, used + 1);
    if (counters.size > MAX_TRACKED) {
        const first = counters.keys().next().value;
        if (first !== undefined)
            counters.delete(first);
    }
    return true;
}

/** 注册 qqbot_send_text 工具（tools 服务缺失时优雅降级） */
export function registerSendTextTool(ctx, sender, manager, logger) {
    const tools = ctx.get('tools');
    if (!tools?.register) {
        logger.warn('im-qqbot: tools 服务不可用，qqbot_send_text 工具未注册');
        return;
    }
    const definition = {
        name: SEND_TEXT_TOOL_NAME,
        description: 'Send one short text message to the current QQ conversation as its own bubble. '
            + 'Use it when a reply should be several short messages instead of one long message: '
            + 'call this tool once per message (at most 3 times per user message). '
            + 'Only works inside a QQ conversation. The final answer is delivered as a message too, '
            + 'so do not repeat text already sent with this tool.',
        parameters: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: '一条消息的正文，建议一到两句、一百字以内。',
                },
            },
            required: ['text'],
            additionalProperties: false,
        },
        output: {
            schema: {
                type: 'object',
                properties: {
                    sent: { type: 'boolean' },
                    length: { type: 'integer' },
                },
                required: ['sent', 'length'],
                additionalProperties: false,
            },
            render: (_args, value) => {
                const v = value;
                return [{ type: 'text', text: `已发送 ${v.length} 字 → QQ` }];
            },
        },
        async execute(args, exec) {
            const text = typeof args.text === 'string' ? args.text.trim() : '';
            if (text.length === 0)
                throw new Error('qqbot_send_text: `text` 不能为空');
            const record = exec.agent !== undefined ? manager.findByAgent(exec.agent) : undefined;
            const target = record?.replyTarget;
            if (target === undefined)
                throw new Error('qqbot_send_text: 无法确定发送目标（仅适用于 QQ 会话）');
            const key = targetKey(target, exec.agent);
            if (!takeSlot(key))
                throw new Error(`qqbot_send_text: 本条消息已发送 ${MAX_PER_INBOUND} 次，超过上限`);
            await sender.sendMarkdown(target, text);
            logger.info(`im-qqbot: qqbot_send_text 发送 ${text.length} 字 → ${target.scope}:${target.targetId}`);
            return { sent: true, length: text.length };
        },
    };
    tools.register(definition);
    logger.info('im-qqbot: qqbot_send_text 工具已注册');
}
